# ConstraintCanvas

A shared floor planning canvas where the human keeps authority through locks and rejections, and every rejection becomes a permanent rule the agent is structurally incapable of breaking again.

Built for the WebMCP Challenge.

**Live app: https://constraint-canvas-rho.vercel.app**

Open it in ChatGPT's in-app browser, or in Chrome with `chrome://flags/#enable-webmcp-testing` enabled, and the nine tools below are available to your agent.

## The idea in one paragraph

Supervising an agent today does not compound. You correct it, the correction lives in a context window, and three turns later you explain yourself again. ConstraintCanvas moves that judgment out of the conversation and into the application. When you reject a change the agent proposed, the app converts the rejection into a named rule with provenance, adds it to a visible rulebook, and enforces it at the tool boundary from then on. The agent does not remember better. The website refuses to let it repeat the mistake.

## What it does

A venue and event floor planner. You drag in stages, tables, booths, exits, bars and walkways on a 2D floor. An agent connected over WebMCP can read the layout, propose plans and request optimisations, but only inside the boundaries you have drawn.

The human decides the aesthetic and political calls. Where the stage goes. Which sponsor gets the front booth. What is non negotiable.

The agent handles the arithmetic. Fitting forty more seats without breaking egress. Finding every table that now violates clearance. Explaining which rule blocked a placement.

The app enforces locks, clearances, capacity and the accumulated rulebook. Neither party can override it. The agent because its writes are validated, the human because violations are shown, though the human may consciously waive a rule.

## The core mechanic

1. The agent proposes a set of changes. Nothing mutates. The canvas shows a ghosted preview and a plain language summary.
2. You accept the whole plan, accept part of it, or reject individual items.
3. A rejection is not discarded. The app derives candidate rules phrased in its own vocabulary, ranked by what you most likely meant, and asks you to confirm or edit one.
4. Confirmed rules enter the rulebook with provenance: what triggered them, when, and which proposal they came from.
5. Every future proposal is validated against the rulebook before the agent can even offer it. Violating plans are refused at the tool boundary and the agent is told exactly which rule it broke and by what margin.
6. Rules are inspectable, editable, waivable and revocable by you at any time.

Twenty minutes of use produces a floor plan and a reusable specification of your judgment.

## Why this needs WebMCP

**The site owns the semantics.** What blocks an exit, or violates aisle clearance, is defined by the application in metres, not inferred from pixels. An agent driving this through DOM automation would guess geometry and silently break rules it cannot see.

**State is genuinely shared and mutable.** Human and agent write to the same canvas at the same time. This is not an agent operating a form alone.

**Read, preview and write are cleanly separable.** Inspection tools are free to call and carry `readOnlyHint`. Anything that touches the floor must go through a proposal a human approves. That separation is expressed in the tool contract itself.

**Constraints are structured data, not prose.** The agent receives a machine readable rulebook and gets structured refusals back, each naming the rule, the offending item and the numeric shortfall. None of this survives being reduced to clicking.

## The tool surface

Nine tools in four groups. All are registered with `document.modelContext.registerTool`.

### Inspection, free to call, no side effects

| Tool | What it returns |
| --- | --- |
| `get_floor_plan` | Room dimensions, grid, capacity, every object with position, footprint, seats and lock status, and optionally the placeable catalogue |
| `get_rulebook` | Every active constraint with its statement, structured parameters, source and origin |
| `get_violations` | What is currently broken and by how much |
| `get_metrics` | Seats against capacity, area used, circulation share, furthest seat to exit, violation count |
| `get_pending_proposal` | What is awaiting a human decision |

### Proposal, the only route to mutation

| Tool | What it does |
| --- | --- |
| `propose_changes` | Validates a changeset against locks and every active rule. Refuses the whole plan if any item breaks one. Otherwise parks it as a ghosted preview awaiting human approval |
| `optimise_layout` | Lays out the unlocked floor against an objective. Tests every candidate position against the live rulebook. Returns a proposal, never a mutation |

### Explanation

| Tool | What it does |
| --- | --- |
| `explain_placement` | Given a kind and a position, reports whether it fits and, if not, which rules block it, which neighbours are involved and by what margin |

### Constraint authoring

| Tool | What it does |
| --- | --- |
| `propose_rule` | Turns a plain language instruction into a structured rule and sends it to the human for confirmation. The agent may draft. Only the human ratifies |

### The contract narrows as you correct it

Rules do not only change what the app will accept. When you ratify one, the app re-registers `propose_changes` and `optimise_layout` with your standing rules written into their own descriptions:

```
Submit a set of placements, moves or removals. [...]

The human has added 1 standing rule during this session. Plans that break any
of them are refused before they reach the human, so satisfy these first:
- No bar within 4.0 m of any exit.
```

The correction therefore reaches the agent as part of the tool definition, before it composes a single call, rather than as an error it has to run into first. The Tools panel reads these descriptions back off the live surface, so you can watch the contract shrink as you work.

### Boundaries that always hold

No tool call mutates a locked object. No tool call mutates the floor without a human approval step in between. Every refusal returns a reason the agent can act on, never a bare failure. The agent can read the rulebook but cannot add to, edit or delete from it.

## Running it locally

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

To exercise the engine without a browser:

```bash
npm run smoke
```

That runs the full loop as a test: the scenario loads clean, the optimiser respects the rulebook, a rejection derives a rule, and the derived rule then blocks the placement that produced it.

### Optional built-in agent

The WebMCP surface needs no API key and no model of its own. The browser brings the agent.

The page also ships a small agent panel so anyone can see the loop without an agent browser to hand. It runs on Gemini through a server route so the key never reaches the client, and it drives the site through `document.modelContext.getTools` and `executeTool` exactly as an external agent would.

```bash
cp .env.local.example .env.local
```

Add your key to `GEMINI_API_KEY` and restart. Without a key the panel explains itself and everything else works unchanged.

## Testing with a real agent

**ChatGPT in-app browser.** Open the deployed URL. WebMCP is supported out of the box.

**Chrome.** Enable `chrome://flags/#enable-webmcp-testing`, restart, then open the URL.

The header chip reports honestly which surface is in use. It reads `WebMCP live` only when `document.modelContext` was provided by the browser. When it is absent the page installs an identically shaped local stand-in so the built-in agent still works, and the chip says `WebMCP stand-in` rather than claiming something untrue.

## How WebMCP is implemented

Two response headers are required before `document.modelContext` exists at all, and both are set in [next.config.ts](next.config.ts):

- `Origin-Agent-Cluster: ?1`, because WebMCP is only exposed in origin isolated documents
- `Permissions-Policy: tools=(self)`, because both APIs are gated behind the `tools` policy

Tools are described once in [src/webmcp/tools.ts](src/webmcp/tools.ts) as plain descriptors, then registered by [src/webmcp/bridge.ts](src/webmcp/bridge.ts). The bridge wraps each `execute` so every call and every refusal lands in the activity log at the boundary rather than inside individual tools. Registration is scoped to an `AbortController` so the whole surface can be withdrawn in one call.

There is more detail in [docs/WEBMCP.md](docs/WEBMCP.md).

## The built-in rules

Eight ship with the app and are always evaluated by the same engine as your own rules.

| Rule | What it checks |
| --- | --- |
| Bounds | Every object sits entirely inside the floor outline |
| Overlap | No two objects overlap |
| Exit clearance | A 2.0 m obstruction free radius around every exit |
| Clearance | At least 0.9 m between any two pieces of furniture |
| Egress distance | Every seated guest within 25 m of an exit |
| Egress path | Every seated guest has an unobstructed walking route to an exit, found by a flood fill outward from the doors rather than a straight line |
| Circulation | At least 70% of the floor stays clear for aisles |
| Capacity | Total seating does not exceed the room capacity |

The egress path rule is the one worth knowing about. A table can sit six metres from a door in a straight line and still be walled in behind a row of booths, and only the flood fill catches that.

## Interface

**Floor canvas.** Grid snapped top down view. Locked objects carry a lock badge and a gold border. Violations pulse red. Agent proposals appear ghosted. Clearance rules are drawn as haloes and zone rules as hatched regions, so a rule you have just ratified becomes visible geometry rather than a line of text.

**Rulebook panel.** The accumulated constraints, each with origin, a waive toggle and a revoke control. This panel grows as you work.

**Proposal tray.** Pending changes with accept all, accept item and reject item. Rejecting opens the rule capture flow.

**Activity log.** Every tool call, refusal, approval and rejection, with counters for calls made and calls refused.

**Metrics strip.** Seats, capacity, utilisation, circulation, furthest seat to exit, violations and active rule count.

**Undo.** Every human action is reversible, with Ctrl+Z or the header control. Undo captures the floor and the pending proposal together, so reversing an approval brings back the proposal it resolved, and reversing a ratification withdraws the rule from the published tool descriptions as well as from the rulebook.

## Scenarios

Two preloaded floors, switched from the left rail.

| Scenario | Floor | What it exercises |
| --- | --- | --- |
| Willowmere Hall | 30 x 20 m, wedding reception, 96 seats | The west side is laid out and the east is deliberately open, so the agent has somewhere obvious to work |
| Kestrel Convention Centre | 40 x 24 m, conference expo hall, 140 seats | Three exits, twelve exhibitor booths, marked aisles and far less slack, so the rules bite sooner |

Loading a scenario clears the floor, the rulebook and the log, and asks first if you have authored any rules.

## Export

Two exports, both from the left rail.

**Plan JSON** carries the floor, the metrics, the violations, the activity log, and the rulebook with each rule's origin recorded. The rulebook is the part worth keeping: it is a written specification of the judgment applied during the session, and it is portable.

**Drawing SVG** is the canvas as a standalone file. The page paints with CSS custom properties, which mean nothing once the markup leaves the document, so every `var()` is resolved against the computed root style and the text styles are inlined on the way out.

## Scope

The constraint model is this application's own simplified planning model. It is labelled as such in the interface and in every `get_rulebook` response. It makes no claim to any real building code in any jurisdiction.

Deliberately out of scope: authentication, any backend database, multi user collaboration, multiple floors, 3D, rotation, freeform resize, and persistence beyond the browser session.

## Performance

The optimiser scans several hundred candidate positions per placement and tests each against the full rulebook, including the egress flood fill. Three things keep an eighty seat pass under a second on the larger floor.

The baseline violation set is computed once per placement rather than once per candidate. Candidates are screened against the cheap rules first, so only survivors pay for the flood fill. And because a seat maximisation pass only ever adds objects, and every rule it can break is monotone under addition, a position rejected in one round is dropped rather than rescanned in the next.

## Stack

Next.js 16 with the App Router, React 19, TypeScript. Styling is hand rolled on IBM Carbon Design System tokens with IBM Plex, which keeps the Carbon look without a heavy component dependency in a canvas driven layout. No state library. No canvas library. The floor is SVG.

## Licence

MIT. See [LICENSE](LICENSE).
