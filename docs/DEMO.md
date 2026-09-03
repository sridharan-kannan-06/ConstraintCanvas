# Demo script

Target is under three minutes with audio. The constraint mechanic has to be visible by the sixty second mark.

## Before you record

1. Open the app in a maximised window at 1600 px wide or more. The layout is built for desktop.
2. Click **Reset scenario** so the floor, rulebook and log all start clean.
3. Confirm the header chip. If you are recording in Chrome with `chrome://flags/#enable-webmcp-testing` on, or in the ChatGPT in-app browser, it should read **WebMCP live**. Say the words on camera.
4. Have the **Rulebook** tab selected in the right rail, not Violations or Tools. It must be on screen and visibly growing for the whole video.

## The line to open with

Do not open with floor plans. Open with supervision.

> "Correcting an agent does not currently compound. You fix it, the fix lives in a context window, and three turns later you are explaining yourself again. This is a floor planner where every correction becomes a rule the agent cannot break again, and the rule lives in the website rather than the model."

## Beats

### 0:00 to 0:20, the problem

Willowmere Hall, a wedding reception, half planned. West side laid out, east side open.

> "The boring half of this job is arithmetic. The important half is judgment. Right now you cannot trust an agent with either."

### 0:20 to 0:40, authority

Click the stage. Show the lock badge. Click each exit.

> "The stage and both exits are locked. These are mine. No tool call can touch them, and that is enforced by the site, not by asking the model nicely."

Point at the green dashed halo around each exit.

> "That ring is the two metre exit clearance the app already enforces."

### 0:40 to 1:10, the agent works

Ask for forty more seats. Either type it into the built-in panel or ask through the agent browser.

> "Fit 40 more seats without breaking egress."

Watch the activity log fill with `get_floor_plan`, `get_rulebook`, `optimise_layout`. Five ghosted tables appear.

> "Nothing has moved. The agent cannot mutate the floor. It can only reach a preview."

Click **Accept all**. Seat count goes 96 to 136.

### 1:10 to 1:40, the mechanic

This is the beat the whole video exists for. Do not rush it.

Before accepting, reject the one table nearest an exit with the X control.

The rule capture dialog opens with ranked candidates.

> "I do not want seating that close to a door. The app has already worked out what I probably meant, and it is offering me the rule rather than just dropping the change."

Adjust the clearance stepper if you like. Click **Add to rulebook**.

The rule lands at the top of the rulebook tagged **from a rejection**, with the provenance line showing the exact item that triggered it. A purple halo appears around both exits on the canvas.

> "That rejection is now a rule. Notice it is drawn on the floor."

### 1:40 to 2:10, the rule holds

Ask the agent to try the same thing again.

> "Put a table back where I just rejected one."

The activity log shows the refusal in red with the rule statement and the margin. Read it out.

> "Refused at the tool boundary. Not talked out of it, not persuaded. The plan never reached me, and the agent was told which rule and by how much."

Then ask it to work around the rule.

> "Then find me the seats somewhere else."

It replans and succeeds.

### 2:10 to 2:35, accountability

> "Why can a booth not go at 4, 1?"

The agent calls `explain_placement` and comes back with the exact rules, the neighbouring objects and the margins in metres.

> "It is not opaque. It can tell you which rule, which neighbour and by what margin."

Optionally show the standing instruction path:

> "Never put a bar within four metres of an exit."

The agent drafts a structured rule. You confirm it. Note that the champagne bar already on the floor immediately lights up as a violation.

> "The agent can draft a rule. Only I can ratify one."

### 2:35 to 3:00, close

Pan the rulebook, now several rules deep, each with its origin.

> "Eight built in rules, and everything below them came from me correcting the agent once. None of this lives in the model's memory. It lives in the website. That is the point. Supervision that compounds."

## What must be legible on screen

If a judge cannot see these, the video has failed:

- The rulebook panel growing
- At least one red refusal line in the activity log with a rule statement in it
- The ghosted preview state before any accept
- The header chip reading WebMCP live

## Things to avoid saying

Do not call it a CAD tool. Do not claim it implements any real building code. Do not describe the agent as autonomous, because the approval step is the premise rather than a limitation.
