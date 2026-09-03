# Devpost submission text

Draft copy for the submission form. Paste and trim to fit.

## Tagline

Every rejection becomes a rule the agent cannot break again.

## What it is

ConstraintCanvas is a venue floor planner where a human and an agent work the same canvas. The human places the stage, locks what is non negotiable, and decides which sponsor gets the front booth. The agent does the arithmetic nobody enjoys: fitting forty more seats without breaking egress, rebalancing spacing after the stage moved, finding every table that now violates clearance.

The differentiator is not the planner. It is what happens when you say no.

When you reject a change the agent proposed, the app does not discard it. It converts the rejection into a named, structured rule, phrased in the app's own vocabulary, and asks you to confirm or edit it. Confirmed rules enter a visible rulebook with full provenance, and every future proposal is validated against them at the tool boundary. The agent is then structurally incapable of repeating the mistake.

## Why this use case is a strong fit for WebMCP

**The site owns the semantics.** What counts as blocking an exit or violating aisle clearance is defined by the application in metres. An agent driving this through DOM automation would have to infer geometry from pixels and would silently break rules it cannot see. Here the rules are handed over as structured data.

**State is genuinely shared and mutable.** Both parties write to the same canvas in the same session. This is not an agent filling in a form on its own, which is where most agent tooling stops.

**Read, preview and write separate cleanly.** Six of the nine tools carry `readOnlyHint` and are free to call. The two tools that touch the floor stop at a preview a human approves item by item. That distinction is expressed in the tool contract itself rather than in prompt text, which means it holds regardless of which model is driving.

**Refusals carry actionable structure.** A blocked proposal returns the rule id, the rule statement, the offending item and the numeric shortfall in metres. The agent replans against facts rather than guessing at a failure.

## How it creates a better user experience

Supervising an agent today does not compound. You correct it, the correction sits in a context window, and a few turns later you are explaining yourself again. The correction is also invisible: you cannot see what the agent currently believes it is allowed to do.

ConstraintCanvas moves that judgment out of the conversation and into the application. Corrections accumulate in a panel you can read, edit, waive and revoke. After twenty minutes you have a floor plan and a reusable written specification of your own judgment, and the enforcement is not a matter of the model's cooperation.

Locks are the sharpest version of this. Lock the stage and no tool call can move it, whatever the agent decides would be optimal.

## What people and agents can do together that was difficult before

Constrained spatial planning where the human sets the boundaries and the agent optimises inside them, with the boundaries enforced by the application rather than by prompt discipline.

Before, you had two options. Do the arithmetic yourself in a spreadsheet and a static diagram, which is what event planners, venue managers and conference organisers actually do today. Or hand it to an agent and re-audit every result, because nothing stops it quietly moving the thing you told it not to touch.

The third option only exists once the site can publish its own rules and enforce them at the tool boundary: delegate the arithmetic, keep the judgment, and have each correction narrow what the agent can do from then on.

## How WebMCP was implemented

Nine tools registered with `document.modelContext.registerTool`, in four groups: inspection, proposal, explanation and constraint authoring.

Two response headers are set before anything else, since `document.modelContext` is not exposed without them: `Origin-Agent-Cluster: ?1` for origin isolation, and `Permissions-Policy: tools=(self)` for the `tools` policy gate.

Tools are described once as plain descriptors and registered through a single bridge that wraps every `execute`, so each call and refusal is recorded in the activity log at the boundary rather than inside individual tools. The whole surface is scoped to an `AbortController` and can be withdrawn in one call. Inspection tools carry `annotations.readOnlyHint`. Results are returned as structured JSON rather than prose.

The tool contract is not static. When the human ratifies a rule, the two proposal tools are re-registered with the active human authored rules written into their own descriptions, and the surface fires `toolchange`. A correction therefore narrows what the agent is told it can do, before it composes a call, rather than only what the app will accept afterwards.

Validation runs before any preview is offered. Locks are checked first and separately. Rules are then evaluated differentially, comparing violations before and after the change, so a floor that already has a problem does not refuse every plan including the ones that would fix it.

The page also ships a small built-in agent so the loop is visible without an agent browser to hand. It calls `getTools` and `executeTool` on the same surface, with the model behind a stateless server route. When `document.modelContext` is absent the page installs an identically shaped local stand-in, and the interface says plainly which of the two is in use rather than overstating it.

## Links

Live app: https://constraint-canvas-rho.vercel.app

## Notes for judges

The floor rules are this application's own simplified planning model, labelled as such in the interface and in every rulebook response. No claim is made to any real building code.

Try this sequence:

1. Ask for forty more seats.
2. Reject the one table nearest an exit and confirm the rule the app derives.
3. Ask for the same placement again and watch it get refused at the tool boundary with the rule and the margin.
4. Ask why a booth will not fit somewhere.
