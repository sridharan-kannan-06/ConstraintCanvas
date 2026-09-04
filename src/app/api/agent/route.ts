import { NextResponse } from "next/server";

/**
 * Server proxy for the in-page agent panel. Holds the API key and no
 * conversation state. The client owns the transcript and executes every tool
 * itself through document.modelContext, so the model reaches the floor plan
 * only through the same surface an external agent would use.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Tried in order. The first that does not answer with a 404 is used.
const MODEL_FALLBACKS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
];

const SYSTEM_INSTRUCTION = `You are the planning assistant built into ConstraintCanvas, a venue floor planner.

The floor plan is not yours. A human owns it. You reach it only through the tools this page publishes.

How to work:
- Inspect before you act. Call get_floor_plan and get_rulebook before your first proposal in a conversation, and get_violations or get_metrics when the human asks how things stand.
- You cannot change the floor. propose_changes and optimise_layout stop at a preview the human approves item by item. Say so plainly rather than claiming you have moved anything.
- Coordinates are metres from the north west corner and refer to the top left of an object footprint.
- Prefer optimise_layout when the human asks for an outcome such as more seats or wider aisles. Use propose_changes when they name specific placements.
- If a call is refused, read the rule it names and plan around it. Never argue with a refusal, never ask the human to waive a rule, and never try the same placement twice.
- When the human states a standing preference, use propose_rule so it becomes a durable constraint rather than something you have to remember.
- explain_placement answers any question about why something will not fit.

Spend as few turns as you can. Every round trip costs the human real quota:
- Read what you need in one go. get_floor_plan with include_catalog true, plus get_rulebook, is enough to plan almost anything.
- Never call a tool twice with the same arguments. Results you have already received are still in front of you in this conversation. If you catch yourself re-reading, act on what you have instead.
- get_violations and get_metrics are for questions about the current state, not a warm up before every proposal.

Style: short and concrete. Two or three sentences. Quote exact numbers, rule statements and margins from tool results rather than paraphrasing them. Never invent an object id.`;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  /**
   * Reasoning models attach a signature to each function call part and reject
   * the next turn without it. Carried through, never read.
   */
  thoughtSignature?: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        kind: "error",
        message:
          "No GEMINI_API_KEY is configured on the server, so the built-in agent is off. The WebMCP tool surface still works: open this page in an agent browser, or in Chrome with the WebMCP testing flag, and drive it from there.",
      },
      { status: 200 }
    );
  }

  let body: { contents?: GeminiContent[]; tools?: unknown[]; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { kind: "error", message: "Malformed request body." },
      { status: 400 }
    );
  }

  const contents = body.contents ?? [];
  const functionDeclarations = body.tools ?? [];

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    tools: functionDeclarations.length
      ? [{ functionDeclarations }]
      : undefined,
    generationConfig: {
      temperature: 0.2,
      // Reasoning tokens count against this cap, so a low value truncates the
      // turn before any call or text is emitted rather than shortening it.
      maxOutputTokens: 8192,
    },
  };

  /*
   * Signatures are minted per model, so a transcript containing one must go
   * back to the model that produced it. A conversation with no signature yet
   * is free to try the rest of the chain.
   */
  const hasSignature = (body.contents ?? []).some((c) =>
    (c.parts ?? []).some((p) => typeof p.thoughtSignature === "string")
  );
  const pinned = body.model;
  const models = pinned
    ? hasSignature
      ? [pinned]
      : [pinned, ...MODEL_FALLBACKS.filter((m) => m !== pinned)]
    : process.env.GEMINI_MODEL
      ? [process.env.GEMINI_MODEL, ...MODEL_FALLBACKS]
      : MODEL_FALLBACKS;

  let lastError = "The model could not be reached.";

  for (const model of models) {
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (response.status === 404) {
      lastError = `Model ${model} is not available to this key.`;
      continue;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorBody = (
        data as {
          error?: {
            message?: string;
            details?: Array<{ "@type"?: string; retryDelay?: string }>;
          };
        } | null
      )?.error;
      const detail = errorBody?.message ?? `HTTP ${response.status}`;

      if (response.status === 429) {
        const retryInfo = errorBody?.details?.find((d) =>
          String(d["@type"] ?? "").includes("RetryInfo")
        );
        const seconds = Math.ceil(
          parseFloat(
            retryInfo?.retryDelay?.replace("s", "") ??
              detail.match(/retry in ([\d.]+)/i)?.[1] ??
              "30"
          )
        );
        // Another model may still have quota, but only a conversation with no
        // signature yet can be moved.
        if (!hasSignature && models.indexOf(model) < models.length - 1) {
          lastError = `${model} is rate limited.`;
          continue;
        }
        return NextResponse.json({
          kind: "error",
          rateLimited: true,
          retryAfterSeconds: seconds,
          model,
          message: `The free tier limit for ${model} is used up. It allows 5 requests a minute and 20 a day per model, and one planning request spends several. Wait about ${seconds} seconds, or drive the page from an agent browser instead, which costs no quota at all.`,
        });
      }

      // A bad key will not be fixed by trying another model.
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return NextResponse.json({ kind: "error", message: detail }, { status: 200 });
      }
      lastError = detail;
      continue;
    }

    const candidate = (
      data as {
        candidates?: Array<{ content?: GeminiContent; finishReason?: string }>;
        usageMetadata?: Record<string, number>;
      } | null
    )?.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const finishReason = candidate?.finishReason;
    const usage = (data as { usageMetadata?: Record<string, number> } | null)
      ?.usageMetadata;

    const calls = parts
      .filter((p) => p.functionCall)
      .map((p) => p.functionCall as { name: string; args: Record<string, unknown> });
    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();

    // An empty candidate is not an answer. Report which limit was reached
    // rather than letting the client show a generic failure.
    if (calls.length === 0 && !text) {
      const detail =
        finishReason === "MAX_TOKENS"
          ? "The model ran out of output tokens partway through the tool loop. Ask again with a narrower request."
          : finishReason && finishReason !== "STOP"
            ? `The model stopped early with finishReason ${finishReason}.`
            : "The model returned an empty response.";
      return NextResponse.json({
        kind: "error",
        message: detail,
        finishReason,
        usage,
        model,
      });
    }

    return NextResponse.json({
      kind: calls.length > 0 ? "calls" : "text",
      calls,
      text,
      model,
      finishReason,
      usage,
      // Appended to the transcript verbatim. Rebuilding them from `calls`
      // would drop the signature and the next request would be rejected.
      modelParts: parts,
    });
  }

  return NextResponse.json({ kind: "error", message: lastError }, { status: 200 });
}
