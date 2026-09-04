# Implementation notes

How the WebMCP integration and the constraint engine work. The product overview is in the [README](../README.md).

## Platform requirements

`document.modelContext` does not exist unless two response headers are set, both in [next.config.ts](../next.config.ts):

```ts
{ key: "Origin-Agent-Cluster", value: "?1" }
{ key: "Permissions-Policy", value: "tools=(self)" }
```

The API is only exposed in origin isolated documents, and it is gated behind the `tools` Permissions Policy. Missing either one makes registration fail with no error, which is an easy way to lose an afternoon.

## Where tools live

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

Keeping a descriptor rather than registering inline puts logging in one place, lets the Tools panel render from the same source, and means the in-page agent and a browser agent run identical code.

[src/webmcp/bridge.ts](../src/webmcp/bridge.ts) registers them, wrapping each `execute` so every call and refusal is logged at the boundary rather than inside individual tools. Each tool owns an `AbortController`, so a re-publish can withdraw the old registration before adding the new one instead of relying on name replacement, which is implementation defined.

## Varying implementations

The specification describes `ModelContext` as an `EventTarget` carrying `getTools` and `executeTool`, but implementations differ in how much of that they expose. One provides `registerTool` without `addEventListener`.

So the only capability assumed is `registerTool`, and everything else is feature detected:

| Capability | Fallback |
| :-- | :-- |
| `addEventListener` | the `ontoolchange` property, then nothing |
| `getTools` | the local tool descriptors |
| `executeTool` | running the descriptor directly |
| `registerTool` for one tool | log it and continue with the rest |

`npm run surface` pins this against four minimal surfaces, since an unguarded call to a missing method inside a React effect unmounts the whole tree.

## The refusal contract

Every refusal names something the agent can act on.

```json
{
  "refused": true,
  "reason": "RULE_VIOLATION",
  "message": "Refused. The plan breaks the rule: No round table within 3.0 m of any exit.",
  "broken_rule": { "id": "rule_11nvq0", "statement": "No round table within 3.0 m of any exit." },
  "offending_item": "Place Round table at 8, 1.",
  "margin": "Round table is 2.5 m from North exit, 0.5 m short of the 3.0 m the rule requires",
  "next_step": "Read get_rulebook, move the offending placement clear of the rule, and submit again."
}
```

The reasons are `RULE_VIOLATION`, `LOCKED_OBJECT`, `PROPOSAL_PENDING`, `NO_VALID_PLAN` and `BAD_INPUT`. `next_step` is a required argument to the refusal helper rather than an optional extra, and a refusal that rejects a value also names the values that would be accepted.

## How validation decides

`submitProposal` in [src/lib/store.ts](../src/lib/store.ts) runs three passes.

Locks are checked first and separately, because a locked object is a hard boundary rather than a rule to be argued down. Rules are then evaluated differentially, comparing violations before and after the change, so a floor that already has a problem does not refuse every plan including the ones that would fix it. A surviving plan becomes a pending preview, and the objects on the floor are untouched until someone accepts an item.

Only one proposal can be pending at a time. A second submission is refused with `PROPOSAL_PENDING` rather than queueing work behind an unanswered question.

## Rejection to rule

When an item is rejected, [src/lib/derive.ts](../src/lib/derive.ts) produces ranked candidates rather than one guess. A rejection near an exit usually means the exit rather than the coordinates, one near a locked object usually means that object, and anything else falls back to the region of the floor it landed in.

Derived distances are floored so a new rule cannot land weaker than the built-in it would shadow. Rejecting something 1.0 m from an exit does not produce a 1.5 m rule that changes nothing, because the built-in already enforces 2.0 m.

The same machinery backs `propose_rule`, which parses a plain language instruction into a candidate. Both paths end at the same confirmation dialog, and neither writes to the rulebook on its own.

## Dynamic re-registration

Ratifying a rule calls `refreshToolDescriptions`, which re-registers the two proposal tools with the active authored rules appended to their descriptions and fires `toolchange`. An agent reading the surface after a correction learns the constraint from the tool definition rather than by being refused. The work is skipped when the rule signature has not moved.

## Egress and circulation

Two of the eight built-in rules need more than a distance check.

Egress path builds an occupancy grid at the floor's grid resolution, marking a cell blocked when its centre falls inside an object, then floods outward from the exits. A seated object passes if any free cell in the ring around its footprint was reached. Testing cell centres rather than any overlap keeps narrow but walkable gaps open, which matters because the clearance rule only guarantees 0.9 m.

Circulation holds the free share of the floor above a threshold, which gives seat maximisation a real ceiling rather than an unbounded one.

## Optimiser performance

The optimiser scans several hundred candidate positions per placement and tests each against the full rulebook including the flood fill. Three things keep an eighty seat pass under a second on the larger floor.

The baseline violation set is computed once per placement rather than once per candidate. Candidates are screened against the cheap rules first, so only survivors pay for the flood fill. And because a seat maximisation pass only adds objects, and every rule it can break is monotone under addition, a position rejected in one round is dropped rather than rescanned in the next.

## Placement quality

A plan can satisfy every rule and still look wrong, because new furniture landing between the existing rows reads as clutter. Scoring therefore works out the pitch a run of furniture repeats at, extends that rhythm to the edges of the floor, and heavily prefers positions on it, with a further preference for sharing a coordinate with something already placed so a block fills out before starting a new run.

This is greedy placement with a scoring pass rather than a solver. The goal is a layout that reads as tidy, not one that is optimally packed.

## The in-page agent

The model runs behind [src/app/api/agent/route.ts](../src/app/api/agent/route.ts), which holds the key and no conversation state. The browser owns the transcript and the tool loop: it converts the published surface into function declarations with `getTools`, posts the transcript to the route, executes each returned call with `executeTool`, appends the results and loops.

Three details are worth recording for anyone building something similar. A function declaration with an empty `properties` map is rejected, so tools taking no arguments are sent with no `parameters` block. Reasoning models attach a signature to each function call part and reject the next request without it, so model turns are echoed back verbatim rather than rebuilt. And signatures are minted per model, so a transcript containing one must return to the model that produced it.
