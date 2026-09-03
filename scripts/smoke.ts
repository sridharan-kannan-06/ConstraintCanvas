// Engine smoke test. Run with: npm run smoke
// Verifies the shipped scenario is clean, the optimiser respects the rulebook,
// and a rejection derives a rule that then blocks the same placement.

import { deriveCandidates } from "../src/lib/derive";
import { computeMetrics } from "../src/lib/metrics";
import { checkPlacement, optimise } from "../src/lib/optimise";
import { evaluateWorld, probeObject } from "../src/lib/rules";
import { loadScenario, makeObject, SCENARIOS } from "../src/lib/scenario";
import type { ProposalItem, Rule, WorldState } from "../src/lib/types";

let failures = 0;
function check(label: string, condition: boolean, extra = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${extra ? `  ${extra}` : ""}`);
}

const world: WorldState = loadScenario();

const initial = evaluateWorld(world);
check(
  "shipped scenario loads with no violations",
  initial.length === 0,
  initial.map((v) => v.margin).join(" | ")
);

const m = computeMetrics(world);
check("scenario has seating", m.seats === 96, `seats=${m.seats}`);
check(
  "every seat reaches an exit inside the limit",
  m.furthestSeatToExitM !== null && m.furthestSeatToExitM < 25,
  `furthest=${m.furthestSeatToExitM}`
);

const plan = optimise(world, "maximise_seating", { targetSeats: 40 });
check(
  "optimiser finds seating for 40 more guests",
  plan.changes.length === 5,
  plan.summary
);

const applied: WorldState = {
  ...world,
  objects: [
    ...world.objects,
    ...plan.changes.map((c, i) =>
      c.op === "add" ? probeObject(c.kind, c.x, c.y, `opt_${i}`) : null
    ).filter((o): o is NonNullable<typeof o> => o !== null),
  ],
};
check(
  "optimiser output introduces no violations",
  evaluateWorld(applied).length === 0,
  evaluateWorld(applied).map((v) => v.margin).join(" | ")
);

// A placement pressed right up against the north exit must be refused.
const nearExit = probeObject("round_table", 4, 1);
const exitCheck = checkPlacement(nearExit, world.objects, world.floor, world.rules);
check(
  "a table on top of the north exit is refused",
  !exitCheck.ok,
  exitCheck.violations[0]?.ruleId ?? ""
);

// Rejection derives a rule, and that rule then blocks a placement that was legal before.
const legal = probeObject("round_table", 14, 6);
check(
  "a table at 14,6 is legal before any human rule exists",
  checkPlacement(legal, world.objects, world.floor, world.rules).ok
);

const item: ProposalItem = {
  id: "item_test",
  change: { op: "add", tempId: "tmp", kind: "round_table", x: 14, y: 6 },
  description: "Place Round table at 14, 6.",
  status: "rejected",
};
const candidates = deriveCandidates(item, world);
check("rejection produces candidate rules", candidates.length > 0);
console.log(
  candidates.map((c) => `      - [${c.id}] ${c.statement}`).join("\n")
);

const zoneCandidate = candidates.find((c) => c.id === "cand_zone");
if (zoneCandidate) {
  const derived: Rule = {
    id: "rule_test",
    statement: zoneCandidate.statement,
    kind: zoneCandidate.kind,
    params: zoneCandidate.params,
    source: "rejection",
    enabled: true,
    provenance: { trigger: "test", createdAt: 0 },
  };
  const withRule = { ...world, rules: [...world.rules, derived] };
  check(
    "the derived rule now blocks the same placement",
    !checkPlacement(legal, withRule.objects, withRule.floor, withRule.rules).ok
  );

  // A newly ratified rule can reveal that existing furniture already breaks it.
  // Those are shown to the human rather than silently corrected, so the test
  // compares against that baseline instead of expecting a clean floor.
  const baseline = evaluateWorld(withRule).length;
  check(
    "the new rule surfaces existing furniture that already breaks it",
    baseline === 3,
    `baseline=${baseline}`
  );

  const replan = optimise(withRule, "maximise_seating", { targetSeats: 40 });
  const replanned: WorldState = {
    ...withRule,
    objects: [
      ...withRule.objects,
      ...replan.changes
        .map((c, i) => (c.op === "add" ? probeObject(c.kind, c.x, c.y, `re_${i}`) : null))
        .filter((o): o is NonNullable<typeof o> => o !== null),
    ],
  };
  check(
    "the optimiser routes around the new rule and adds no new violations",
    replan.changes.length > 0 && evaluateWorld(replanned).length === baseline,
    replan.summary
  );
}

// Egress path. A table sealed into a corner by two booths has nowhere to walk,
// even though it is only a few metres from the door in a straight line.
const sealedFloor = { name: "Test", widthM: 10, heightM: 10, gridM: 0.5, capacity: 100 };
const sealed = [
  makeObject("round_table", 0, 0, { label: "Trapped table" }),
  makeObject("booth", 0, 2.4, { label: "Wall booth A" }),
  makeObject("booth", 2.4, 0, { label: "Wall booth B", vertical: true }),
  makeObject("exit", 8, 0, { label: "Far exit" }),
];
const sealedViolations = evaluateWorld({
  floor: sealedFloor,
  objects: sealed,
  rules: world.rules,
}).filter((v) => v.ruleId === "builtin.egress_path");
check(
  "a table walled into a corner has no egress path",
  sealedViolations.length === 1,
  sealedViolations[0]?.margin ?? "no egress_path violation raised"
);

// The same table with one wall removed can reach the door again.
const openViolations = evaluateWorld({
  floor: sealedFloor,
  objects: [sealed[0], sealed[1], sealed[3]],
  rules: world.rules,
}).filter((v) => v.ruleId === "builtin.egress_path");
check(
  "removing one wall restores the egress path",
  openViolations.length === 0,
  openViolations.map((v) => v.margin).join(" | ")
);

// Circulation. Three extra stages push the floor past the clear area minimum.
const packed = {
  ...world,
  objects: [
    ...world.objects,
    makeObject("stage", 20, 1, { label: "Pack 1" }),
    makeObject("stage", 20, 6, { label: "Pack 2" }),
    makeObject("stage", 20, 11, { label: "Pack 3" }),
  ],
};
const circ = evaluateWorld(packed).filter((v) => v.ruleId === "builtin.circulation");
check(
  "packing the floor trips the circulation minimum",
  circ.length === 1,
  circ[0]?.margin ?? "no circulation violation raised"
);
check(
  "the shipped scenario is comfortably inside the circulation minimum",
  evaluateWorld(world).filter((v) => v.ruleId === "builtin.circulation").length === 0
);

// The optimiser runs on the main thread, so a slow pass freezes the interface.
// Both scenarios are timed because the larger floor costs noticeably more.
for (const scenario of SCENARIOS) {
  const started = Date.now();
  optimise(scenario.build(), "maximise_seating", { targetSeats: 80 });
  const elapsed = Date.now() - started;
  check(
    `seat maximisation on ${scenario.id} stays responsive`,
    elapsed < 1500,
    elapsed + " ms"
  );
}

// Every shipped scenario must load clean. A preloaded floor that already
// breaks a rule would make the violation display meaningless on first sight.
for (const scenario of SCENARIOS) {
  const w = scenario.build();
  const v = evaluateWorld(w);
  const seats = w.objects.reduce((n, o) => n + o.seats, 0);
  check(
    `scenario ${scenario.id} loads with no violations`,
    v.length === 0,
    v.map((x) => x.margin).join(" | ") || `${w.objects.length} objects, ${seats} seats`
  );
  check(
    `scenario ${scenario.id} leaves room for the agent to work`,
    optimise(w, "maximise_seating", { targetSeats: 40 }).changes.length > 0
  );
}

console.log(failures === 0 ? "\nAll engine checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
