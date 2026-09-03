# How WebMCP is implemented

This document covers the mechanics. The product argument lives in the [README](../README.md).

## Platform requirements

`document.modelContext` does not exist unless two conditions hold. Both are response headers, set in [next.config.ts](../next.config.ts):

```ts
{ key: "Origin-Agent-Cluster", value: "?1" }
{ key: "Permissions-Policy", value: "tools=(self)" }
```

WebMCP is only exposed in origin isolated documents, and both the imperative and declarative APIs are gated behind the `tools` Permissions Policy. Miss either one and registration fails silently, which is the single most common way an integration appears broken for no visible reason. Getting these in place was the first commit in this repository, before any product code.

## Where tools are defined

Tools are described once, as plain data, in [src/webmcp/tools.ts](../src/webmcp/tools.ts):

```ts
export interface CanvasTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  group: "inspection" | "proposal" | "explanation" | "authoring";
  execute: (input: Record<string, unknown>) => unknown;
}
```

Keeping a local descriptor rather than calling `registerTool` inline buys three things. Logging happens in one place. The tool inspector panel can render the surface from the same source of truth. And the built-in agent panel and an external browser agent run through identical code.

## Registration

[src/webmcp/bridge.ts](../src/webmcp/bridge.ts) registers the surface:

```ts
await document.modelContext.registerTool(
  {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: tool.readOnly },
    execute: async (rawInput) => { /* log, run, log refusals, stringify */ },
  },
  { signal: controller.signal }
);
```

Notes on the choices:

**`annotations.readOnlyHint`** is set from the descriptor. Six tools carry it: the five inspection tools and `explain_placement`, which answers questions without touching anything. The three that reach the proposal or authoring path do not.

**`AbortController`** scopes the whole surface. One `controller.abort()` withdraws all nine tools, which is what `disconnectBridge` uses.

**Return values are JSON strings.** `execute` returns a stringified object rather than prose. Agents get structured refusals with a machine readable `reason` field, the rule that was broken, the offending item and the numeric margin.

**Logging is at the boundary.** The wrapper records a `tool_call` entry before running, and a `tool_refusal` entry when the result carries `refused: true`. Individual tools never touch the log, so no tool can forget to.

## Dynamic re-registration

The most interesting use of the API here is that the tool contract is not static.

When the human ratifies a rule, `refreshToolDescriptions` re-registers the two proposal tools with the active human authored rules appended to their descriptions. Registering an existing name replaces the previous definition, and the surface fires `toolchange`, which the interface listens for to keep the Tools panel accurate.

The effect is that correcting the agent narrows what the agent is told it can do, not just what the app will accept. An agent reading the surface after a correction learns the constraint from the tool definition rather than by being refused. The work is skipped when the rule signature has not moved, so there is no churn.

## The refusal contract

Every refusal is actionable. A bare failure would leave an agent guessing.

```json
{
  "refused": true,
  "reason": "RULE_VIOLATION",
  "message": "Refused. The plan breaks the rule: No round table within 5.0 m of any exit.",
  "broken_rule": { "id": "rule_11nvq0", "statement": "No round table within 5.0 m of any exit." },
  "offending_item": "Place Round table at 8, 4.",
  "margin": "Round table is 4.3 m from North exit, 0.7 m short of the 5.0 m the rule requires",
  "next_step": "Read get_rulebook, adjust the offending placement, and submit again. The rule will not be relaxed for you."
}
```

The four refusal reasons are `RULE_VIOLATION`, `LOCKED_OBJECT`, `PROPOSAL_PENDING` and `BAD_INPUT`.

## How validation decides

`submitProposal` in [src/lib/store.ts](../src/lib/store.ts) runs three passes.

1. **Locks first, and separately.** A locked object is not a rule that can be argued down, it is a hard boundary on the tool surface. Any move or remove targeting one is refused before anything else is evaluated.
2. **Differential rule evaluation.** The floor is evaluated before and after the proposed changes, and only violations that did not already exist cause a refusal. Without this, a floor that already has one problem would refuse every plan forever, including the plans that fix it.
3. **Preview, not mutation.** A surviving plan becomes a pending proposal. The objects on the floor are untouched until a human accepts an item.

Only one proposal can be pending at a time. A second submission is refused with `PROPOSAL_PENDING`, which keeps the human in the loop rather than letting an agent queue work behind an unanswered question.

## Rejection to rule

When a human rejects a proposal item, [src/lib/derive.ts](../src/lib/derive.ts) produces ranked candidate rules rather than one guess.

The ranking is opinionated. A rejection near an exit almost always means the exit rather than the coordinates, so that candidate leads. A rejection near a locked object usually means the locked object. Everything else falls back to the named region of the floor the human was pointing at.

Derived distances are floored so a new rule cannot land weaker than the built-in it would shadow. Rejecting something 1.0 m from an exit does not produce a 1.5 m rule that changes nothing, because the built-in already enforces 2.0 m.

The same machinery backs `propose_rule`, which parses a plain language instruction into a candidate. Both paths end in the same confirmation dialog, and neither writes to the rulebook without a human tap.

## The two surfaces

An agent browser provides `document.modelContext`. When it is absent, [bridge.ts](../src/webmcp/bridge.ts) installs a local object of the same shape under the same name, implementing `registerTool`, `getTools`, `executeTool` and `toolchange`.

This is a development and demonstration convenience, not a claim. The header chip reads `WebMCP live` only when the browser supplied the object, and `WebMCP stand-in` when the page installed it. The built-in agent panel goes through `getTools` and `executeTool` in both cases, so the code path being demonstrated is the real one either way.

## The built-in agent

The model runs behind [src/app/api/agent/route.ts](../src/app/api/agent/route.ts), which is stateless and holds only the API key. The browser owns the transcript and the tool loop:

1. Client converts the published surface into function declarations with `document.modelContext.getTools()`.
2. Client posts the transcript and declarations to the route.
3. Route calls the model and returns either text or function calls.
4. Client executes each call with `document.modelContext.executeTool()`.
5. Client appends the results and loops, up to eight turns.

The tools genuinely execute in the page through the WebMCP surface. The server never touches the floor plan and has no idea what a floor plan is.

One detail worth recording: a function declaration with an empty `properties` map is rejected by the model API, so tools that take no arguments are sent with no `parameters` block at all.
