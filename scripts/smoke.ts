// Engine smoke test. Run with: npm run smoke
// Verifies the shipped scenario is clean, the optimiser respects the rulebook,
// and a rejection derives a rule that then blocks the same placement.

import { deriveCandidates } from "../src/lib/derive.ts";
import { computeMetrics } from "../src/lib/metrics.ts";
import { checkPlacement, optimise } from "../src/lib/optimise.ts";
import { evaluateWorld, probeObject } from "../src/lib/rules.ts";
import { loadScenario } from "../src/lib/scenario.ts";
import type { ProposalItem, Rule, WorldState } from "../src/lib/types.ts";

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

console.log(failures === 0 ? "\nAll engine checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
