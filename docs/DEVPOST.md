# About the project

Paste into the Devpost "About the project" field. Markdown, ready to use.

## What it is

ConstraintCanvas is a venue floor planner where a human and an agent work the same canvas at the same time. You place the stage, lock what is non negotiable, and decide which sponsor gets the front booth. The agent does the arithmetic nobody enjoys: fitting forty more seats without breaking egress, finding every table that now violates clearance, explaining exactly which rule blocked a placement.

The planner is not the point. What happens when you say no is the point.

## Inspiration

Supervising an agent does not compound. You correct it, the correction lives in a context window, and a few turns later you are explaining yourself again. Worse, the correction is invisible. You cannot look anywhere to see what the agent currently believes it is allowed to do.

That felt like the wrong place to be storing a human's judgment. If I tell a tool that seating must never go near a door, that is not a conversational aside. It is policy. It should live in the application, be visible, be editable, and be enforced whether or not the model feels cooperative today.

So the mechanic came first and the floor plan came second. Reject one agent proposal, and the app turns that rejection into a named rule with provenance, adds it to a visible rulebook, and refuses every future plan that breaks it. The agent does not remember better. The website stops it.

## Why this use case fits WebMCP

**The site owns the semantics.** What counts as blocking an exit is defined by the app in metres, not inferred from pixels. An agent driving this through DOM automation would guess at geometry and silently break rules it cannot see. Here the rulebook is handed over as structured data.

**State is genuinely shared and mutable.** Both parties write to the same canvas in the same session. This is not an agent filling in a form on its own, which is where most agent tooling stops.

**Read, preview and write separate cleanly.** Six of the nine tools carry `readOnlyHint` and are free to call. The two that touch the floor stop at a preview a human approves item by item. That distinction lives in the tool contract, not in prompt text, so it holds regardless of which model is driving.

**Refusals carry structure.** A blocked plan returns the rule id, the statement, the offending item and the numeric shortfall in metres. The agent replans against facts instead of guessing at a failure.

## What people and agents can do together that was hard before

Constrained spatial planning where the human sets the boundaries and the agent optimises inside them, with the boundaries enforced by the application rather than by prompt discipline.

Before, there were two options. Do the arithmetic yourself in a spreadsheet and a static diagram, which is what event planners and venue managers actually do today. Or hand it to an agent and re-audit every result, because nothing stops it quietly moving the thing you told it not to touch.

The third option only exists once a site can publish its own rules and enforce them at the tool boundary. Delegate the arithmetic, keep the judgment, and have each correction narrow what the agent can do from then on.

## How WebMCP was implemented

Nine tools registered with `document.modelContext.registerTool`, in four groups: inspection, proposal, explanation and constraint authoring.

Two response headers come before any product code, because `document.modelContext` is not exposed without them. `Origin-Agent-Cluster: ?1` for origin isolation, and `Permissions-Policy: tools=(self)` for the tools policy gate. Miss either and registration fails silently, which is the most common way one of these integrations looks broken for no visible reason.

Tools are described once as plain descriptors and registered through a single bridge that wraps every `execute`, so each call and refusal is recorded at the boundary rather than inside individual tools. Each tool owns an abort controller, so the surface can be withdrawn or republished predictably. Results are JSON, not prose.

The most interesting part is that **the tool contract is not static**. When you ratify a rule, the two proposal tools are re-registered with your standing rules written into their own `description`, and the surface fires `toolchange`. So a correction changes what the agent is *told it can do*, before it composes a single call, rather than only what the app will reject afterwards. The Tools panel reads descriptions back off the live surface, so you can watch the contract shrink as you work.

Validation runs in three passes. Locks first and separately, because a locked object is a hard boundary rather than a rule to be argued down. Then differential rule evaluation, comparing violations before and after, so a floor that already has a problem does not refuse every plan including the ones that would fix it. Only then does a surviving plan become a preview.

## How I built it

Next.js 16 with the App Router, React 19, TypeScript. Styling is hand rolled on IBM Carbon design tokens with IBM Plex, which keeps the Carbon look without a heavy component dependency in a canvas driven layout. No state library, no canvas library. The floor is SVG. Deployed on Vercel.

The constraint engine is deliberately not a solver. Placement is greedy with a scoring pass, because nobody inspects the algorithm and everybody inspects whether the rules hold. Eight built in rules ship with the app, evaluated by exactly the same engine as human authored ones. Two are worth naming. Egress path is a flood fill outward from the doors over the floor grid, because a table can sit six metres from an exit in a straight line and still be walled in behind a row of booths. Circulation holds the free area above a threshold:

$$\frac{A_{\text{floor}} - \sum_i w_i h_i}{A_{\text{floor}}} \ge 0.70$$

which gives seat maximisation a real ceiling instead of an unbounded one.

There is also a small built in agent panel so the loop is visible to anyone without an agent browser to hand. It calls `getTools` and `executeTool` on the same surface, with the model behind a stateless server route so no key reaches the browser.

## Challenges

**The primary target browser rendered nothing at all.** The spec describes `ModelContext` as an `EventTarget`, so I subscribed to `toolchange` in an effect. ChatGPT's implementation does not expose `addEventListener`. The call threw, React unmounted the tree, and the app was a blank page in the one browser that mattered most. My Chrome testing never caught it because Chrome's implementation is more complete. Every native call is now feature detected against a floor of `registerTool` alone, with a regression test covering four deliberately minimal surfaces.

**A bare refusal cost the agent six turns.** `optimise_layout` was called with a free text objective and returned the message "Unknown objective." No valid values, no next step. The agent had no way to discover what a known objective looked like, so it started guessing at argument shapes and gave up. This violated the one principle the whole project is built on. `next_step` is now a required argument to the refusal helper rather than an optional extra, and refusals that reject a value must name the values that would be accepted.

**Thinking models bind their tool calls.** Gemini 3 attaches a thought signature to every function call part and rejects the following request without it. I was rebuilding parts from an extracted call list and dropping it, so the loop died after two calls. The route now echoes the model turn back verbatim.

**Legal is not the same as tidy.** Early proposals satisfied every rule and still looked wrong, because new tables landed between the existing rows. Two causes. The scenarios laid seating on a pitch that did not fall on the grid the optimiser scans, so alignment was arithmetically impossible. And the score never mentioned alignment at all. Scoring now reads the pitch a run of furniture repeats at and extends that rhythm, which is the first thing a human notices about a plan and the last thing a clearance check measures.

**A free tier of twenty requests a day.** One planning request was spending five or six of them, because the model re-read the floor plan and the rulebook between every step. Repeated inspection calls are now served from a per conversation cache with a note that nothing has changed, and proposal calls clear it.

## What I learned

Write the tool contract as if the agent has no other source of truth, because it does not. Every refusal is a fork in the road, and a refusal that names nothing is a dead end that costs real turns and real money.

Do not generalise from one implementation of an emerging standard. A green light in Chrome proved registration worked in Chrome, and I reported it as the surface being proven. It was not.

And the interesting affordance of WebMCP turned out not to be calling functions from a page. It is that the *set* of functions, and their descriptions, are yours to change at runtime. That is what makes a correction narrow the agent rather than merely annoy it.

## Scope

The rules are this app's own simplified planning model, labelled as such in the interface and in every rulebook response. No claim is made to any real building code. Deliberately out of scope: authentication, any backend database, multi user collaboration, multiple floors, 3D, rotation, and persistence beyond the browser session.
