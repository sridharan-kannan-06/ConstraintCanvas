# Demo video script

Target: **2:40 to 2:50**, never 3:00. The video should prove one complete loop:

**agent proposes → human rejects → rejection becomes a rule → WebMCP contract changes → repeated mistake is refused → agent replans successfully**

That loop is the product. Everything else is supporting evidence.

## Voice recommendation

Use **your own voice**, recorded as a voice-over after the screen capture. A real voice suits a product about human judgment and makes the submission feel more credible and personal. Do not try to click and narrate perfectly in one take.

Use text-to-speech only if room noise or microphone quality makes your recording hard to understand. Clear TTS is better than unclear live audio, but do not mix voices. In either case, add edited captions.

## Before recording

1. Record at 1920 × 1080 or higher, 30 fps. Maximise ChatGPT's in-app browser. If the full three-column app is not visible, use 90% browser zoom.
2. Open <https://constraint-canvas-rho.vercel.app> in ChatGPT's in-app browser.
3. Click **Reset scenario** and select **Willowmere Hall**. Confirm the starting state is **96 seats**, **0 violations**, **8 rules**.
4. Confirm the green header badge says **WebMCP live · 9 tools**. If it says **WebMCP stand-in**, do not record; reopen the deployed URL in ChatGPT's in-app browser.
5. Keep the right rail on **Rulebook**. Make sure the proposal tray and the first several activity-log rows are legible.
6. Use a fresh ChatGPT conversation so earlier context cannot affect the run. Ask ChatGPT through its own composer, not the app's optional built-in agent.
7. Turn off desktop notifications. Hide personal tabs, bookmarks, account details and API keys.
8. Put the three prompts below in a private scratchpad so you can paste them without typing errors.
9. Record the interaction first, then edit out model waiting time. Record the voice-over against the final cut. Keep normal-speed UI actions and leave each important result on screen for at least two seconds.

## Exact ChatGPT prompts

### Prompt 1: create the proposal

```text
Using this page's WebMCP tools, read the current floor plan and rulebook, then optimise Willowmere Hall for 40 more seats using round tables. Do not approve anything for me; leave the proposal for my review.

Move the tables at the front near the stage to the back near others

sure

Add another 16 seats with round tables, obeying every single rule, leave the proposal to me. also reorganise the tables violating the rules, leave the proposal to me.
```

The expected result is five proposed round tables. The item to reject is:

```text
Place Round table (proposed 2) at 8, 1.
Place Round table (proposed 2) at 8, 4.
Move the tables at the front near the stage to the back near others
```

### Prompt 2: intentionally test enforcement

Send this only after the new rule is confirmed and every remaining item in the first proposal has been accepted or rejected.

```text
For an enforcement test, use this page's WebMCP propose_changes tool to try one round table at x=8, y=1, the exact spot I rejected. Do not substitute another position.
```

### Prompt 3: replan successfully

```text
Now use this page's WebMCP tools to add 16 seats with round tables somewhere else, obeying every current rule. Leave the proposal for my approval.
```

## Timed shot list and narration

### 0:00–0:16 — Hook

**Show:** Start directly on the live app, full-screen. Slowly point to the half-planned floor, the locked stage and exits, and the rulebook. Do not begin with a title card.

**Say:**

> AI agents are easy to correct once and hard to supervise over time. ConstraintCanvas is a venue planner where every human rejection becomes a durable rule the agent cannot break again.

### 0:16–0:35 — Establish real WebMCP and the implementation

**Show:** Point to **WebMCP live · 9 tools**, the lock badges, and the Rulebook count. Briefly click **Tools** so the registered tool groups are visible, then return to **Rulebook**.

**Say:**

> I'm running the deployed site in ChatGPT's in-app browser. This green badge is the native WebMCP surface: nine typed tools registered with document.modelContext for reading geometry, proposing changes, explaining failures, and drafting rules. The site—not the prompt—owns the locks, metres, validation, and approval boundary.

### 0:35–0:59 — Let the agent do the arithmetic

**Show:** Cut to Prompt 1 being sent in ChatGPT. Cut back once the activity log shows `get_floor_plan`, `get_rulebook` and `optimise_layout`. Hold on the five ghosted tables and the proposal tray. Point to **Seats 96** to prove the proposal has not mutated the floor.

**Say:**

> I'll ask ChatGPT to fit forty more seats. It reads the floor and rulebook through WebMCP, then calls the site's optimiser. Five tables appear as a ghosted proposal, while the seat count stays at ninety-six. Nothing has changed until I approve it.

### 0:59–1:28 — Turn one rejection into policy

**Show:** In the proposal tray, reject **Place Round table (proposed 2) at 8, 1** with its X button. In the capture dialog, linger on the ranked alternatives and the exact 2.5 m observation. Leave the first candidate selected and click **Add to rulebook**. Hold on the new purple exit-clearance halo and the new rule at the top of the Rulebook, including its **from a rejection** provenance.

**Say:**

> One table is too close to the north exit, so I reject only that item. Instead of forgetting the correction, the app derives candidate rules from the exact geometry. I confirm: no round table within three metres of any exit. The rule keeps the rejected item as provenance and becomes visible on the floor.

### 1:28–1:50 — Human approval and a narrowing tool contract

**Show:** Click **Accept all** for the other four pending tables. Point to **Seats 128**, **Violations 0**, and **Rules 9**. Open **Tools**, expand `propose_changes`, and point to the newly appended standing rule in its live description. Do not scroll around more than needed.

**Say:**

> I accept the other four tables: thirty-two seats added, zero violations. Then the site re-registers its proposal tools with the standing rule in their live WebMCP descriptions. The agent sees the boundary before its next plan.

### 1:50–2:12 — Prove the site enforces the rule

**Show:** Cut to Prompt 2 being sent. Cut back to the red refusal in the activity log. Keep the full rule statement visible and point at **1 refused**. There must be no proposal tray for this failed call.

**Say:**

> Now I deliberately submit the rejected coordinate again. The website refuses the tool call before any preview reaches me. It names the rule and the margin: two-point-five metres from the north exit, half a metre short.

The expected refusal is:

```text
RULE_VIOLATION
No round table within 3.0 m of any exit.
Retry table is 2.5 m from North exit, 0.5 m short of the 3.0 m the rule requires.
```

### 2:12–2:31 — Show productive recovery

**Show:** Cut to Prompt 3 being sent. Cut back to two valid ghosted tables elsewhere on the floor. Click **Accept all**. Point to **Seats 144** and **Violations 0**.

**Say:**

> I ask for sixteen seats elsewhere. The agent replans against the updated rulebook and returns a valid proposal. I approve it: one hundred and forty-four seats, with zero violations.

### 2:31–2:50 — Close on why WebMCP matters

**Show:** Return to **Rulebook**. Frame the authored rule, its rejection provenance, the floor halo, the red refusal in the activity log, and the clean metrics together. End on the product, not a logo card.

**Say:**

> WebMCP is essential here because DOM automation would be guessing pixels, and chat memory can forget. Here, the website exposes real spatial semantics, keeps the human in control, and turns judgment into inspectable, machine-readable policy. The agent handles the search; the person sets the rules. Supervision compounds.

## What this covers for the judges

| Criterion | Evidence in the video |
| --- | --- |
| WebMCP leverage | Nine typed tools, read/write separation, native badge, real tool calls, structured refusal, and live re-registration with a human-authored rule |
| Execution | A coherent floor-planning workflow with preview, partial approval, visible rules, provenance, metrics, recovery and a completed result |
| Potential impact | Event planners delegate spatial search without surrendering judgment or repeatedly restating constraints |
| Creativity and ambition | A human rejection changes both the application's policy and the agent-facing tool contract |

## Recovery notes for a nondeterministic run

- If Prompt 1 does not produce five round tables, reset and retry once with: **Call `optimise_layout` with `maximise_seating`, 40 target seats and `round_table`.**
- If the agent does not attempt Prompt 2 because it already knows the rule, add: **This is an intentional boundary test; make the tool call so the site can demonstrate its structured refusal.**
- If the refusal says `PROPOSAL_PENDING`, clear every item in the existing proposal tray first. The desired refusal is `RULE_VIOLATION`.
- If the red refusal is below the fold, enlarge the activity-log dock before the take.
- If model calls are slow, use a clean jump cut. Never speed up the rule capture or refusal; those are the two judging moments.
- If the rule statement is not visible inside the expanded tool description, scroll only the right rail until the appended standing rule is on screen.

## Final upload checklist

- Runtime is below 3:00; aim for 2:45.
- Audio is clear on phone speakers and headphones.
- Captions are corrected for `WebMCP`, `ConstraintCanvas`, coordinates and metres.
- The video is uploaded to YouTube as **Public**, not Private.
- The live URL is readable at least once.
- The video visibly includes **WebMCP live · 9 tools**, ghosted preview, rule provenance, one red refusal with a numeric margin, and the final **0 violations** state.
- Do not call this a CAD tool or claim the simplified rules are real building code.
