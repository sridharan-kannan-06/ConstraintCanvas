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

function key(v: Violation): string {
  return `${v.ruleId}::${[...v.objectIds].sort().join(",")}`;
}

/**
 * Violations already present before a candidate is considered. The optimiser
 * computes this once per placement rather than once per candidate position,
 * which is worth doing because it otherwise doubles the work of every test.
 */
export function baselineKeys(
  objects: FloorObject[],
  floor: Floor,
  rules: Rule[]
): Set<string> {
  return new Set(evaluate(objects, floor, rules).map(key));
}

// The egress path rule floods the whole floor grid, so it costs far more than
// the rest put together. Candidates are screened against everything else first
// and only survivors pay for it.
const EXPENSIVE: Rule["kind"][] = ["egress_path"];

/**
 * Tests a hypothetical object against the live rulebook and reports only the
 * problems that object itself causes. This is the primitive behind both the
 * optimiser and the explain tool, so the two can never disagree.
 */
export function checkPlacement(
  probe: FloorObject,
  objects: FloorObject[],
  floor: Floor,
  rules: Rule[],
  baseline?: Set<string>
): PlacementCheck {
  const before = baseline ?? baselineKeys(objects, floor, rules);
  const withProbe = [...objects, probe];

  const caused = (found: Violation[]) =>
    found.filter((v) => {
      if (before.has(key(v))) return false;
      return v.objectIds.length === 0 || v.objectIds.includes(probe.id);
    });

  const cheapRules = rules.filter((r) => !EXPENSIVE.includes(r.kind));
  const cheap = caused(evaluate(withProbe, floor, cheapRules));
  if (cheap.length > 0) return { ok: false, violations: cheap };

  const expensiveRules = rules.filter((r) => EXPENSIVE.includes(r.kind));
  if (expensiveRules.length === 0) return { ok: true, violations: [] };

  const expensive = caused(evaluate(withProbe, floor, expensiveRules));
  return { ok: expensive.length === 0, violations: expensive };
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
 * The coordinates an existing run of furniture implies along one axis. Takes
 * the positions in use, works out the pitch they repeat at, and extends it to
 * the edges of the floor. A block at 7, 10 and 13 implies a row at 16.
 */
function lattice(values: number[], limit: number): Set<number> {
  const half = (v: number) => Math.round(v * 2) / 2;
  const uniq = [...new Set(values.map(half))].sort((a, b) => a - b);
  const out = new Set(uniq);
  if (uniq.length < 2) return out;

  const counts = new Map<number, number>();
  for (let i = 1; i < uniq.length; i++) {
    const d = half(uniq[i] - uniq[i - 1]);
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const pitch = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!pitch || pitch <= 0) return out;

  for (let v = uniq[0] - pitch; v >= 0; v -= pitch) out.add(half(v));
  for (let v = uniq[uniq.length - 1] + pitch; v <= limit; v += pitch) {
    out.add(half(v));
  }
  return out;
}

interface Lattices {
  xs: Set<number>;
  ys: Set<number>;
}

function latticesFor(
  objects: FloorObject[],
  kind: ObjectKind,
  floor: Floor
): Lattices {
  const same = objects.filter((o) => o.kind === kind);
  return {
    xs: lattice(
      same.map((o) => o.x),
      floor.widthM
    ),
    ys: lattice(
      same.map((o) => o.y),
      floor.heightM
    ),
  };
}

/**
 * Scores a valid position, lower being better. The goal is a layout that
 * reads as tidy rather than one that is optimally packed, so there is no
 * solver here by design.
 */
function scorePosition(
  probe: FloorObject,
  objects: FloorObject[],
  floor: Floor,
  lattices: Lattices
): number {
  const c = centreOf(rectOf(probe));
  const seating = objects.filter((o) => o.seats > 0);
  const sameKind = objects.filter((o) => o.kind === probe.kind);
  const stage = objects.find((o) => o.kind === "stage");

  let score = 0;

  // Alignment dominates the rest of the score. A legal placement still looks
  // wrong if it sits between the existing rows rather than continuing them.
  const half = (v: number) => Math.round(v * 2) / 2;
  if (!lattices.xs.has(half(probe.x))) score += 12;
  if (!lattices.ys.has(half(probe.y))) score += 12;

  // Sharing a coordinate with something already placed beats sitting on the
  // implied rhythm alone, so a block fills out before starting a new run.
  const aligns = (a: number, b: number) => Math.abs(a - b) < 0.05;
  if (!sameKind.some((o) => aligns(o.x, probe.x))) score += 3;
  if (!sameKind.some((o) => aligns(o.y, probe.y))) score += 3;

  if (seating.length > 0) {
    const nearest = Math.min(
      ...seating.map((o) => rectGap(rectOf(probe), rectOf(o)))
    );
    // Sit just past the minimum clearance rather than far away, so the block
    // grows outward at its own pitch instead of drifting across the floor.
    score += Math.abs(nearest - 1.2) * 4;

    // Keep the seating compact by pulling towards where it already is.
    const cx =
      seating.reduce((n, o) => n + centreOf(rectOf(o)).x, 0) / seating.length;
    const cy =
      seating.reduce((n, o) => n + centreOf(rectOf(o)).y, 0) / seating.length;
    score += Math.hypot(c.x - cx, c.y - cy) * 0.5;
  }

  // A mild pull towards the stage, enough to break ties but not enough to
  // outweigh lining up with the rows that are already there.
  const focus = stage
    ? centreOf(rectOf(stage))
    : { x: floor.widthM / 2, y: floor.heightM / 2 };
  score += Math.hypot(c.x - focus.x, c.y - focus.y) * 0.15;

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
  // This pass only adds objects, and every rule it can break is monotone under
  // addition, so a candidate rejected in one round stays rejected. Dropping it
  // avoids rescanning it in every later round.
  let positions = candidatePositions(world.floor, kind, 1);
  let placed = 0;
  let seatsAdded = 0;

  while (seatsAdded < targetSeats) {
    // The floor only changes between rounds, so the baseline is computed here
    // rather than inside the scan over several hundred candidate positions.
    const baseline = baselineKeys(working, world.floor, world.rules);
    // Recomputed each round so the rhythm accounts for what was just added.
    const lattices = latticesFor(working, kind, world.floor);
    let best: { x: number; y: number; score: number } | null = null;
    const survivors: Array<{ x: number; y: number }> = [];
    for (const p of positions) {
      const probe = probeObject(kind, p.x, p.y, `__try_${placed}__`);
      const check = checkPlacement(
        probe,
        working,
        world.floor,
        world.rules,
        baseline
      );
      if (!check.ok) continue;
      survivors.push(p);
      const score = scorePosition(probe, working, world.floor, lattices);
      if (!best || score < best.score) best = { ...p, score };
    }
    positions = survivors;
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
