import { specFor } from "./catalog";
import {
  centreDistance,
  fmtM,
  rectContains,
  rectGap,
  rectOf,
  rectsOverlap,
  round1,
} from "./geometry";
import type {
  FloorObject,
  Floor,
  ObjectKind,
  Rule,
  Violation,
  WorldState,
} from "./types";

/**
 * The rules that ship with the application. They are a simplified planning
 * model owned by this app and make no claim to any real building code.
 * They are evaluated by exactly the same engine as human authored rules.
 */
export function builtinRules(): Rule[] {
  const mk = (
    id: string,
    statement: string,
    kind: Rule["kind"],
    params: Rule["params"]
  ): Rule => ({
    id,
    statement,
    kind,
    params,
    source: "builtin",
    enabled: true,
    provenance: { trigger: "Ships with the application.", createdAt: 0 },
  });

  return [
    mk(
      "builtin.bounds",
      "Every object must sit entirely inside the floor outline.",
      "within_bounds",
      {}
    ),
    mk("builtin.overlap", "No two objects may overlap.", "no_overlap", {}),
    // Exit clearance is listed ahead of general clearance on purpose. When a
    // placement breaks both, the exit is the more useful thing to tell a human.
    mk(
      "builtin.exit",
      "Keep a 2.0 m obstruction free radius around every exit.",
      "exit_clearance",
      { meters: 2 }
    ),
    mk(
      "builtin.clearance",
      "Keep at least 0.9 m of clearance between any two pieces of furniture.",
      "min_clearance",
      { meters: 0.9 }
    ),
    mk(
      "builtin.egress",
      "Every seated guest must be within 25 m of an exit.",
      "egress_distance",
      { meters: 25 }
    ),
    mk(
      "builtin.capacity",
      "Total seating must not exceed the room capacity.",
      "capacity",
      {}
    ),
  ];
}

function kindMatches(
  kinds: ObjectKind[] | undefined,
  kind: ObjectKind
): boolean {
  return !kinds || kinds.length === 0 || kinds.includes(kind);
}

/** Furniture is everything that occupies floor space and is not a doorway. */
function isFurniture(o: FloorObject): boolean {
  return o.kind !== "exit";
}

function evalRule(rule: Rule, objects: FloorObject[], floor: Floor): Violation[] {
  const out: Violation[] = [];
  const push = (
    objectIds: string[],
    margin: string,
    severity: Violation["severity"] = "error"
  ) =>
    out.push({
      ruleId: rule.id,
      ruleStatement: rule.statement,
      objectIds,
      margin,
      severity,
    });

  switch (rule.kind) {
    case "within_bounds": {
      const bounds = { x: 0, y: 0, w: floor.widthM, h: floor.heightM };
      for (const o of objects) {
        if (!rectContains(bounds, rectOf(o))) {
          push([o.id], `${o.label} extends past the floor outline`);
        }
      }
      break;
    }

    case "no_overlap": {
      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const a = objects[i];
          const b = objects[j];
          if (rectsOverlap(rectOf(a), rectOf(b))) {
            push([a.id, b.id], `${a.label} overlaps ${b.label}`);
          }
        }
      }
      break;
    }

    case "min_clearance": {
      const need = rule.params.meters ?? 0.9;
      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const a = objects[i];
          const b = objects[j];
          if (!isFurniture(a) || !isFurniture(b)) continue;
          if (
            !kindMatches(rule.params.kinds, a.kind) &&
            !kindMatches(rule.params.kinds, b.kind)
          )
            continue;
          if (rectsOverlap(rectOf(a), rectOf(b))) continue;
          const gap = rectGap(rectOf(a), rectOf(b));
          if (gap < need - 1e-6) {
            push(
              [a.id, b.id],
              `${fmtM(gap)} between ${a.label} and ${b.label}, ${fmtM(
                need - gap
              )} short of the ${fmtM(need)} minimum`
            );
          }
        }
      }
      break;
    }

    case "exit_clearance": {
      const need = rule.params.meters ?? 2;
      const exits = objects.filter((o) => o.kind === "exit");
      for (const exit of exits) {
        for (const o of objects) {
          if (o.kind === "exit") continue;
          const gap = rectGap(rectOf(exit), rectOf(o));
          if (gap < need - 1e-6) {
            push(
              [o.id, exit.id],
              `${o.label} sits ${fmtM(gap)} from ${exit.label}, inside the ${fmtM(
                need
              )} exit radius`
            );
          }
        }
      }
      break;
    }

    case "egress_distance": {
      const need = rule.params.meters ?? 25;
      const exits = objects.filter((o) => o.kind === "exit");
      if (exits.length === 0) {
        if (objects.some((o) => o.seats > 0)) {
          push([], "The floor has seating but no exit at all");
        }
        break;
      }
      for (const o of objects) {
        if (o.seats <= 0) continue;
        const nearest = Math.min(
          ...exits.map((e) => centreDistance(rectOf(o), rectOf(e)))
        );
        if (nearest > need + 1e-6) {
          push(
            [o.id],
            `${o.label} is ${fmtM(nearest)} from the nearest exit, ${fmtM(
              nearest - need
            )} over the ${fmtM(need)} limit`
          );
        }
      }
      break;
    }

    case "capacity": {
      const limit = rule.params.limit ?? floor.capacity;
      const seats = objects.reduce((n, o) => n + o.seats, 0);
      if (seats > limit) {
        push(
          [],
          `${seats} seats against a capacity of ${limit}, over by ${seats - limit}`
        );
      }
      break;
    }

    case "keep_out_zone": {
      const zone = rule.params.zone;
      if (!zone) break;
      for (const o of objects) {
        if (!kindMatches(rule.params.kinds, o.kind)) continue;
        if (rectsOverlap(rectOf(o), zone)) {
          push(
            [o.id],
            `${o.label} sits inside the ${
              rule.params.zoneName ?? "reserved"
            } zone`
          );
        }
      }
      break;
    }

    case "keep_clear_of": {
      const need = rule.params.meters ?? 2;
      const anchors = rule.params.anchorId
        ? objects.filter((o) => o.id === rule.params.anchorId)
        : objects.filter((o) => kindMatches(rule.params.fromKinds, o.kind));
      for (const o of objects) {
        if (!kindMatches(rule.params.kinds, o.kind)) continue;
        for (const anchor of anchors) {
          if (anchor.id === o.id) continue;
          const gap = rectGap(rectOf(o), rectOf(anchor));
          if (gap < need - 1e-6) {
            push(
              [o.id, anchor.id],
              `${o.label} is ${fmtM(gap)} from ${anchor.label}, ${fmtM(
                need - gap
              )} short of the ${fmtM(need)} the rule requires`
            );
          }
        }
      }
      break;
    }

    case "keep_near": {
      const need = rule.params.meters ?? 5;
      const anchor = objects.find((o) => o.id === rule.params.anchorId);
      if (!anchor) break;
      for (const o of objects) {
        if (o.id === anchor.id) continue;
        if (!kindMatches(rule.params.kinds, o.kind)) continue;
        const gap = rectGap(rectOf(o), rectOf(anchor));
        if (gap > need + 1e-6) {
          push(
            [o.id, anchor.id],
            `${o.label} is ${fmtM(gap)} from ${anchor.label}, ${fmtM(
              gap - need
            )} beyond the ${fmtM(need)} the rule allows`
          );
        }
      }
      break;
    }
  }

  return out;
}

/** Evaluates every enabled rule against a set of objects. */
export function evaluate(
  objects: FloorObject[],
  floor: Floor,
  rules: Rule[]
): Violation[] {
  const out: Violation[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    out.push(...evalRule(rule, objects, floor));
  }
  return out;
}

export function evaluateWorld(world: WorldState): Violation[] {
  return evaluate(world.objects, world.floor, world.rules);
}

/**
 * Stable identity for a violation so that two evaluations can be compared.
 * Without this the tool boundary could not tell a pre-existing problem apart
 * from one the agent just introduced.
 */
export function violationKey(v: Violation): string {
  return `${v.ruleId}::${[...v.objectIds].sort().join(",")}`;
}

export function newViolations(
  before: Violation[],
  after: Violation[]
): Violation[] {
  const seen = new Set(before.map(violationKey));
  return after.filter((v) => !seen.has(violationKey(v)));
}

/** Builds a throwaway object used to test a hypothetical placement. */
export function probeObject(
  kind: ObjectKind,
  x: number,
  y: number,
  id = "__probe__"
): FloorObject {
  const spec = specFor(kind);
  return {
    id,
    kind,
    label: `Proposed ${spec.label.toLowerCase()}`,
    x: round1(x),
    y: round1(y),
    w: spec.w,
    h: spec.h,
    locked: false,
    seats: spec.seats,
  };
}
