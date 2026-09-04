# ConstraintCanvas

A venue floor planner where a person and an agent work the same canvas, and where rejecting an agent's proposal turns that correction into a rule the agent cannot break again.

Live at https://constraint-canvas-rho.vercel.app

## What it does

You place stages, tables, booths, exits, bars and walkways on a 2D floor. An agent connected over WebMCP can read the layout, propose changes and request optimisations, but only inside the boundaries you have drawn.

You make the judgment calls. Where the stage goes, which sponsor gets the front booth, what is not up for discussion.

The agent does the arithmetic. Fitting forty more seats without breaking egress, finding every table that now violates clearance, explaining which rule blocked a placement.

The application enforces locks, clearances, capacity and the accumulated rulebook. Agent writes are validated before they reach you, and your own violations are shown rather than blocked, since you can waive a rule deliberately.

## The loop

1. The agent proposes a set of changes. Nothing moves. The canvas shows a ghosted preview.
2. You accept the plan, accept part of it, or reject individual items.
3. A rejection is not discarded. The app derives candidate rules from the geometry, ranked by likely intent, and asks you to confirm or edit one.
4. Confirmed rules join the rulebook with their origin recorded.
5. Later proposals are validated against the rulebook before they can be offered. A plan that breaks a rule is refused at the tool boundary, naming the rule and the margin.
6. Rules stay inspectable, editable, waivable and revocable.

## Tool surface

Nine tools registered with `document.modelContext.registerTool`. Six carry `readOnlyHint`.

| Tool | Group | What it does |
| :-- | :-- | :-- |
| `get_floor_plan` | inspection | Room dimensions, grid, capacity, and every object with position, footprint, seats and lock status |
| `get_rulebook` | inspection | Every active constraint with its statement, parameters, source and origin |
| `get_violations` | inspection | What is currently broken and by how much |
| `get_metrics` | inspection | Seats against capacity, area used, circulation, furthest seat to exit |
| `get_pending_proposal` | inspection | What is awaiting a decision |
| `propose_changes` | proposal | Validates a changeset against locks and every active rule, then parks it as a preview |
| `optimise_layout` | proposal | Lays out the unlocked floor against an objective, returning a proposal |
| `explain_placement` | explanation | Why an object will not fit somewhere, with the rule, the neighbours and the margin |
| `propose_rule` | authoring | Turns a plain language instruction into a structured rule for confirmation |

Four boundaries hold regardless of what an agent asks for. No tool call moves a locked object. No tool call changes the floor without an approval step. Every refusal carries a reason and a next step. The rulebook is readable but not writable by the agent.

### The contract narrows as you correct it

Ratifying a rule re-registers `propose_changes` and `optimise_layout` with your standing rules written into their own descriptions:

```
Submit a set of placements, moves or removals. [...]

The human has added 1 standing rule during this session. Plans that break any
of them are refused before they reach the human, so satisfy these first:
- No bar within 4.0 m of any exit.
```

A correction therefore reaches the agent as part of the tool definition, before it composes a call, rather than as an error it runs into afterwards. The Tools panel reads these descriptions back off the live surface.

## Built-in rules

Eight ship with the app, evaluated by the same engine as rules you author.

| Rule | What it checks |
| :-- | :-- |
| Bounds | Every object sits inside the floor outline |
| Overlap | No two objects overlap |
| Exit clearance | A 2.0 m obstruction free radius around every exit |
| Clearance | At least 0.9 m between any two pieces of furniture |
| Egress distance | Every seated guest within 25 m of an exit |
| Egress path | Every seated guest has an unobstructed walking route to an exit |
| Circulation | At least 70% of the floor stays clear for aisles |
| Capacity | Total seating does not exceed the room capacity |

Egress path is the one worth knowing about. A table can sit six metres from a door in a straight line and still be walled in behind a row of booths, so it is answered with a flood fill outward from the exits rather than a distance check.

## Running locally

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

```bash
npm test
```

runs the engine and compatibility checks without a browser.

### Optional in-page agent

The WebMCP surface needs no API key, because the browser brings the agent. The page also ships a small agent panel so the loop is usable without an agent browser to hand. It calls `getTools` and `executeTool` on the same surface, with the model behind a server route so the key never reaches the client.

```bash
cp .env.local.example .env.local
```

Add a key to `GEMINI_API_KEY` and restart. Without one the panel says so and nothing else changes.

## Testing with an agent

Open the URL in ChatGPT's desktop app browser with site tools enabled, or in Chrome with `chrome://flags/#enable-webmcp-testing`.

The header reads `WebMCP live` only when the browser provided `document.modelContext`. When it is absent the page installs a local implementation of the same interface so the in-page agent still works, and the header says `WebMCP stand-in` instead.

## Scenarios

Two preloaded floors, switched from the left rail.

| Scenario | Floor | What it exercises |
| :-- | :-- | :-- |
| Willowmere Hall | 30 x 20 m wedding reception, 96 seats | West side laid out, east side open, so there is obvious work to do |
| Kestrel Convention Centre | 40 x 24 m expo hall, 140 seats | Three exits, twelve booths, marked aisles and far less slack |

## Export

Plan JSON carries the floor, metrics, violations, activity log and the rulebook with each rule's origin. Drawing SVG is the canvas as a standalone file, with CSS custom properties resolved and text styles inlined so it renders outside the page.

## Architecture

Implementation notes are in [docs/WEBMCP.md](docs/WEBMCP.md), covering the platform headers, the refusal contract, how validation decides, and how a rejection becomes a rule.

Next.js 16 with the App Router, React 19 and TypeScript. Styling is hand rolled on IBM Carbon design tokens with IBM Plex, which keeps the Carbon look without a component dependency in a canvas driven layout. No state library and no canvas library. The floor is SVG.

## Scope

The constraint model is this application's own simplified planning model, labelled as such in the interface and in every `get_rulebook` response. It makes no claim to any real building code.

Out of scope by choice: authentication, a backend database, multi user collaboration, multiple floors, 3D, rotation, freeform resize, and persistence beyond the browser session.

## Licence

MIT. See [LICENSE](LICENSE).
