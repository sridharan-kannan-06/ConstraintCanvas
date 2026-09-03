"use client";

import { useEffect, useRef, useState } from "react";
import { callToolThroughBridge } from "@/webmcp/bridge";
import { TOOLS } from "@/webmcp/tools";
import { useAppState } from "@/lib/useStore";
import { IconCollapse, IconExpand, IconSend } from "./icons";

interface Part {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface Content {
  role: "user" | "model";
  parts: Part[];
}

interface Bubble {
  id: number;
  role: "user" | "assistant" | "tool";
  body: string;
  /** Tool arguments, kept apart from the name so the row can stay on one line. */
  args?: string;
}

const SUGGESTIONS = [
  "Fit 40 more seats without breaking egress.",
  "Why can a booth not go at 4, 1?",
  "Which tables are closest to breaking a rule?",
  "Never put a bar within 4 m of an exit.",
];

/**
 * Renders the small amount of markdown a model reaches for unprompted: bold
 * runs and inline code. Anything else is left as plain text. This is a
 * formatter, not a parser, and it exists only so that answers quoting a rule
 * do not arrive full of visible asterisks.
 */
function formatted(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * The built-in agent.
 *
 * Every tool call is executed here in the page through
 * document.modelContext.executeTool, the same entry point an external agent
 * uses. The model itself runs behind an API route so the key stays server
 * side. Nothing about the tool contract changes between the two paths.
 */
interface Props {
  expanded: boolean;
  onToggleExpand: () => void;
}

export default function AgentPanel({ expanded, onToggleExpand }: Props) {
  const state = useAppState();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<Content[]>([]);
  // Whichever model answered first stays with this conversation, so thought
  // signatures are never replayed to a model that did not mint them.
  const modelRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const push = (role: Bubble["role"], body: string, args?: string) => {
    nextId.current += 1;
    setBubbles((b) => [...b, { id: nextId.current, role, body, args }]);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  /** Converts the published tool surface into Gemini function declarations. */
  async function declarations() {
    const mc = document.modelContext;
    if (!mc) return [];
    const tools = await mc.getTools();

    return tools.map((t) => {
      const published = t.inputSchema as
        | { type?: string; properties?: Record<string, unknown>; required?: string[] }
        | undefined;

      // Prefer the schema the surface hands back, since that is what an
      // external agent would receive. Fall back to the local descriptor when
      // the surface returns nothing usable, because a tool whose enum went
      // missing gets called with invented arguments and the agent then burns
      // its turns guessing at shapes rather than planning.
      const local = TOOLS.find((c) => c.name === t.name)?.inputSchema as
        | { properties?: Record<string, unknown> }
        | undefined;
      const publishedHasProps =
        published?.properties && Object.keys(published.properties).length > 0;
      const schema = publishedHasProps ? published : local;

      const hasProps =
        schema?.properties && Object.keys(schema.properties).length > 0;

      return {
        name: t.name,
        description: t.description ?? "",
        // A declaration with an empty properties map is rejected, so tools that
        // take no arguments are sent without a parameters block at all.
        ...(hasProps ? { parameters: schema } : {}),
      };
    });
  }

  async function run(prompt: string) {
    if (busy) return;
    setBusy(true);
    push("user", prompt);
    historyRef.current.push({ role: "user", parts: [{ text: prompt }] });

    try {
      const tools = await declarations();

      for (let turn = 0; turn < 8; turn++) {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: historyRef.current,
            tools,
            model: modelRef.current ?? undefined,
          }),
        });
        const data = await res.json();
        if (data.model) modelRef.current = data.model;

        if (data.kind === "error") {
          push("assistant", data.message);
          break;
        }

        if (data.kind === "calls" && data.calls?.length) {
          // Echo the model turn back exactly as it arrived. Thinking models
          // attach a signature to each function call part and reject the next
          // request if it is missing, so these parts are never rebuilt by hand.
          historyRef.current.push({
            role: "model",
            parts:
              data.modelParts ??
              data.calls.map((c: { name: string; args: Record<string, unknown> }) => ({
                functionCall: c,
              })),
          });

          const responseParts: Part[] = [];
          for (const c of data.calls) {
            // Some models namespace a call as default_api:tool_name.
            const name = c.name.includes(":") ? c.name.split(":").pop()! : c.name;
            const args = JSON.stringify(c.args ?? {});
            push("tool", name, args === "{}" ? undefined : args);
            let raw: string;
            try {
              raw = await callToolThroughBridge(name, c.args ?? {});
            } catch (err) {
              raw = JSON.stringify({
                refused: true,
                message: err instanceof Error ? err.message : String(err),
              });
            }
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = { result: raw };
            }
            // The response is keyed by the name the model used, namespace and
            // all, so it can correlate the result with its own call.
            responseParts.push({
              functionResponse: { name: c.name, response: parsed },
            });
          }

          historyRef.current.push({ role: "user", parts: responseParts });
          continue;
        }

        const text = data.text || "No answer came back from the model.";
        push("assistant", text);
        historyRef.current.push({ role: "model", parts: [{ text }] });
        break;
      }
    } catch (err) {
      push("assistant", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || state.bridge.mode === "none";

  return (
    <section className="dock-pane">
      <div className="panel-head">
        <span className="panel-title">Built-in agent</span>
        <div className="header-spacer" />
        <span
          className="tag"
          title="Tool calls run through document.modelContext in this page."
        >
          via document.modelContext
        </span>
        {bubbles.length > 0 && (
          <button
            className="btn ghost small"
            onClick={() => {
              setBubbles([]);
              historyRef.current = [];
              modelRef.current = null;
            }}
            disabled={busy}
          >
            Clear
          </button>
        )}
        <button
          className="icon-btn"
          onClick={onToggleExpand}
          title={expanded ? "Shrink the panel" : "Expand the panel"}
        >
          {expanded ? <IconCollapse /> : <IconExpand />}
        </button>
      </div>

      <div className="agent-messages" ref={scrollRef}>
        {bubbles.length === 0 && (
          <div className="empty" style={{ padding: 0 }}>
            This panel drives the same nine tools an agent browser would. Use it
            if you are not in ChatGPT or a WebMCP enabled Chrome. Every call it
            makes appears in the activity log on the left.
          </div>
        )}
        {bubbles.map((b) =>
          b.role === "tool" ? (
            <div className="tool-call" key={b.id} title={b.args ?? "no arguments"}>
              <span className="tool-call-dot" />
              <span className="tool-call-name">{b.body}</span>
              {b.args && <span className="tool-call-args">{b.args}</span>}
            </div>
          ) : (
            <div className={`msg ${b.role}`} key={b.id}>
              <div className="msg-body">
                {b.role === "assistant" ? formatted(b.body) : b.body}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="tool-call working">
            <span className="tool-call-dot" />
            <span className="tool-call-name">working</span>
          </div>
        )}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="suggestion"
            onClick={() => run(s)}
            disabled={disabled}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="agent-input"
        onSubmit={(e) => {
          e.preventDefault();
          const value = input.trim();
          if (!value) return;
          setInput("");
          void run(value);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent to plan something"
          disabled={disabled}
        />
        <button className="btn" type="submit" disabled={disabled || !input.trim()}>
          <IconSend />
        </button>
      </form>
    </section>
  );
}
