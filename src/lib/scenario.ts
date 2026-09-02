import { specFor } from "./catalog";
import { builtinRules } from "./rules";
import type { FloorObject, ObjectKind, WorldState } from "./types";

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeObject(
  kind: ObjectKind,
  x: number,
  y: number,
  opts: { label?: string; locked?: boolean; vertical?: boolean } = {}
): FloorObject {
  const spec = specFor(kind);
  const w = opts.vertical ? spec.h : spec.w;
  const h = opts.vertical ? spec.w : spec.h;
  return {
    id: nextId(kind),
    kind,
    label: opts.label ?? spec.label,
    x,
    y,
    w,
    h,
    locked: opts.locked ?? false,
    seats: spec.seats,
  };
}

/**
 * The Willowmere Hall wedding reception, half planned.
 * The west side is laid out. The east side is deliberately left open so an
 * agent has real work to do, and so the demo has somewhere to put new seating.
 */
export function loadScenario(): WorldState {
  const objects: FloorObject[] = [];

  objects.push(
    makeObject("stage", 11, 1, { label: "Main stage", locked: true })
  );
  objects.push(
    makeObject("exit", 4, 0, { label: "North exit", locked: true })
  );
  objects.push(
    makeObject("exit", 24, 19.6, { label: "South exit", locked: true })
  );
  objects.push(makeObject("bar", 1, 3.5, { label: "Champagne bar" }));

  let table = 0;
  for (const y of [7, 9.9, 12.8]) {
    for (const x of [2, 4.9, 7.8, 10.7]) {
      table += 1;
      objects.push(
        makeObject("round_table", x, y, { label: `Table ${table}` })
      );
    }
  }

  objects.push(makeObject("booth", 26, 6, { label: "Sponsor booth A" }));
  objects.push(makeObject("booth", 26, 9, { label: "Sponsor booth B" }));
  objects.push(
    makeObject("walkway", 14, 9, { label: "Central aisle" })
  );

  return {
    floor: {
      name: "Willowmere Hall",
      widthM: 30,
      heightM: 20,
      gridM: 0.5,
      capacity: 240,
    },
    objects,
    rules: builtinRules(),
  };
}
