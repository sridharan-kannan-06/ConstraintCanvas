import { specFor } from "./catalog";
import { centreOf, rectGap, rectOf, round1, snap } from "./geometry";
import { evaluate, probeObject } from "./rules";
import type {
  ChangeOp,
  Floor,
  FloorObject,
  ObjectKind,
  Rule,
  Violation,
  WorldState,
} from "./types";

export type Objective =
  | "maximise_seating"
  | "widen_circulation"
  | "improve_sightlines";

export interface PlacementCheck {
  ok: boolean;
  violations: Violation[];
}

/**
 * Tests a hypothetical object against the live rulebook and reports only the
 * problems that object itself causes. This is the primitive behind both the
 * optimiser and the explain tool, so the two can never disagree.
 */
export function checkPlacement(
  probe: FloorObject,
  objects: FloorObject[],
  floor: Floor,
  rules: Rule[]
): PlacementCheck {
  const baseline = new Set(
    evaluate(objects, floor, rules).map(
      (v) => `${v.ruleId}::${[...v.objectIds].sort().join(",")}`
    )
  );
  const after = evaluate([...objects, probe], floor, rules);
  const caused = after.filter((v) => {
    const key = `${v.ruleId}::${[...v.objectIds].sort().join(",")}`;
    if (baseline.has(key)) return false;
    return v.objectIds.length === 0 || v.objectIds.includes(probe.id);
  });
  return { ok: caused.length === 0, violations: caused };
}

function candidatePositions(
  floor: Floor,
  kind: ObjectKind,
  step: number
): Array<{ x: number; y: number }> {
  const spec = specFor(kind);
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y + spec.h <= floor.heightM + 1e-6; y += step) {
    for (let x = 0; x + spec.w <= floor.widthM + 1e-6; x += step) {
      out.push({ x: round1(snap(x, floor.gridM)), y: round1(snap(y, floor.gridM)) });
    }
  }
  return out;
}

/**
 * Scores a valid position. Lower is better.
 *
 * The intent is a plan a human would recognise as tidy rather than a
 * mathematically optimal one. Seating clusters near existing seating and
 * faces the stage. There is no solver here on purpose, because the demo is
 * about whether the rules hold, not about packing efficiency.
 */
function scorePosition(
  probe: FloorObject,
  objects: FloorObject[],
  floor: Floor
): number {
  const c = centreOf(rectOf(probe));
  const seating = objects.filter((o) => o.seats > 0);
  const stage = objects.find((o) => o.kind === "stage");

  let score = 0;

  if (seating.length > 0) {
    const nearest = Math.min(
      ...seating.map((o) => rectGap(rectOf(probe), rectOf(o)))
    );
    // Prefer sitting just past the minimum clearance rather than far away.
    score += Math.abs(nearest - 1.2) * 3;
  }

  if (stage) {
    const sc = centreOf(rectOf(stage));
    score += Math.hypot(c.x - sc.x, c.y - sc.y) * 0.4;
  } else {
    score += Math.hypot(c.x - floor.widthM / 2, c.y - floor.heightM / 2) * 0.4;
  }

  return score;
}

export interface OptimiseResult {
  changes: ChangeOp[];
  summary: string;
  notes: string[];
}

function maximiseSeating(
  world: WorldState,
  kind: ObjectKind,
  targetSeats: number
): OptimiseResult {
  const spec = specFor(kind);
  const working = [...world.objects];
  const changes: ChangeOp[] = [];
  const notes: string[] = [];
  const positions = candidatePositions(world.floor, kind, 1);
  let placed = 0;
  let seatsAdded = 0;

  while (seatsAdded < targetSeats) {
    let best: { x: number; y: number; score: number } | null = null;
    for (const p of positions) {
      const probe = probeObject(kind, p.x, p.y, `__try_${placed}__`);
      const check = checkPlacement(probe, working, world.floor, world.rules);
      if (!check.ok) continue;
      const score = scorePosition(probe, working, world.floor);
      if (!best || score < best.score) best = { ...p, score };
    }
    if (!best) {
      notes.push(
        `Stopped after ${placed} placements. No remaining position satisfies the rulebook.`
      );
      break;
    }
    const id = `new_${placed + 1}`;
    const obj = probeObject(kind, best.x, best.y, id);
    obj.label = `${spec.label} (proposed ${placed + 1})`;
    working.push(obj);
    changes.push({
      op: "add",
      tempId: id,
      kind,
      x: best.x,
      y: best.y,
      label: obj.label,
    });
    placed += 1;
    seatsAdded += spec.seats;
  }

  return {
    changes,
    summary: `Add ${placed} ${spec.label.toLowerCase()}${
      placed === 1 ? "" : "s"
    } for ${seatsAdded} extra seats.`,
    notes,
  };
}

function widenCirculation(world: WorldState): OptimiseResult {
  const changes: ChangeOp[] = [];
  const notes: string[] = [];
  const movable = world.objects.filter(
    (o) => !o.locked && o.kind !== "exit" && o.seats > 0
  );

  // Find the tightest pairs and nudge the unlocked half of each pair outward.
  const pairs: Array<{ a: FloorObject; b: FloorObject; gap: number }> = [];
  for (const a of movable) {
    for (const b of world.objects) {
      if (a.id === b.id || b.kind === "exit") continue;
      const gap = rectGap(rectOf(a), rectOf(b));
      if (gap < 1.6) pairs.push({ a, b, gap });
    }
  }
  pairs.sort((p, q) => p.gap - q.gap);

  const moved = new Set<string>();
  const working = [...world.objects];

  for (const pair of pairs.slice(0, 8)) {
    if (moved.has(pair.a.id)) continue;
    const ca = centreOf(rectOf(pair.a));
    const cb = centreOf(rectOf(pair.b));
    const dx = ca.x - cb.x;
    const dy = ca.y - cb.y;
    const len = Math.hypot(dx, dy) || 1;
    const push = 1.6 - pair.gap + 0.3;

    for (const factor of [1, 1.5, 2]) {
      const nx = round1(
        snap(pair.a.x + (dx / len) * push * factor, world.floor.gridM)
      );
      const ny = round1(
        snap(pair.a.y + (dy / len) * push * factor, world.floor.gridM)
      );
      if (nx === pair.a.x && ny === pair.a.y) continue;
      const probe: FloorObject = { ...pair.a, x: nx, y: ny };
      const others = working.filter((o) => o.id !== pair.a.id);
      if (!checkPlacement(probe, others, world.floor, world.rules).ok) continue;
      changes.push({ op: "move", id: pair.a.id, x: nx, y: ny });
      moved.add(pair.a.id);
      const idx = working.findIndex((o) => o.id === pair.a.id);
      working[idx] = probe;
      break;
    }
  }

  if (changes.length === 0) {
    notes.push(
      "Nothing could be spread further without breaking a rule or moving a locked object."
    );
  }

  return {
    changes,
    summary: `Move ${changes.length} item${
      changes.length === 1 ? "" : "s"
    } apart to widen circulation.`,
    notes,
  };
}

function improveSightlines(world: WorldState): OptimiseResult {
  const stage = world.objects.find((o) => o.kind === "stage");
  if (!stage) {
    return {
      changes: [],
      summary: "No stage on the floor, so there are no sightlines to improve.",
      notes: ["Place a stage first."],
    };
  }

  const sc = centreOf(rectOf(stage));
  const seating = world.objects
    .filter((o) => o.seats > 0 && !o.locked)
    .map((o) => ({
      o,
      dist: Math.hypot(centreOf(rectOf(o)).x - sc.x, centreOf(rectOf(o)).y - sc.y),
    }))
    .sort((a, b) => b.dist - a.dist);

  const changes: ChangeOp[] = [];
  const working = [...world.objects];

  for (const { o } of seating.slice(0, 6)) {
    const co = centreOf(rectOf(o));
    const dx = sc.x - co.x;
    const dy = sc.y - co.y;
    const len = Math.hypot(dx, dy) || 1;
    for (const step of [2, 1.5, 1]) {
      const nx = round1(snap(o.x + (dx / len) * step, world.floor.gridM));
      const ny = round1(snap(o.y + (dy / len) * step, world.floor.gridM));
      if (nx === o.x && ny === o.y) continue;
      const probe: FloorObject = { ...o, x: nx, y: ny };
      const others = working.filter((w) => w.id !== o.id);
      if (!checkPlacement(probe, others, world.floor, world.rules).ok) continue;
      changes.push({ op: "move", id: o.id, x: nx, y: ny });
      const idx = working.findIndex((w) => w.id === o.id);
      working[idx] = probe;
      break;
    }
  }

  return {
    changes,
    summary: `Pull ${changes.length} seating item${
      changes.length === 1 ? "" : "s"
    } closer to the stage.`,
    notes:
      changes.length === 0
        ? ["Every unlocked seat is already as close to the stage as the rules allow."]
        : [],
  };
}

export function optimise(
  world: WorldState,
  objective: Objective,
  options: { kind?: ObjectKind; targetSeats?: number } = {}
): OptimiseResult {
  switch (objective) {
    case "maximise_seating":
      return maximiseSeating(
        world,
        options.kind ?? "round_table",
        options.targetSeats ?? 40
      );
    case "widen_circulation":
      return widenCirculation(world);
    case "improve_sightlines":
      return improveSightlines(world);
  }
}
