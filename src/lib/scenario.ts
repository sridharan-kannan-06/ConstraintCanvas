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

export interface ScenarioDef {
  id: string;
  name: string;
  /** One line shown next to the name in the scenario picker. */
  subtitle: string;
  build: () => WorldState;
}

/**
 * Willowmere Hall, a wedding reception, half planned.
 * The west side is laid out. The east side is deliberately left open so an
 * agent has real work to do, and so the demo has somewhere to put new seating.
 */
function buildWillowmere(): WorldState {
  const objects: FloorObject[] = [];

  objects.push(
    makeObject("stage", 11, 1, { label: "Main stage", locked: true })
  );
  objects.push(makeObject("exit", 4, 0, { label: "North exit", locked: true }));
  objects.push(
    makeObject("exit", 24, 19.6, { label: "South exit", locked: true })
  );
  objects.push(makeObject("bar", 1, 3.5, { label: "Champagne bar" }));

  let table = 0;
  for (const y of [7, 9.9, 12.8]) {
    for (const x of [2, 4.9, 7.8, 10.7]) {
      table += 1;
      objects.push(makeObject("round_table", x, y, { label: `Table ${table}` }));
    }
  }

  objects.push(makeObject("booth", 26, 6, { label: "Sponsor booth A" }));
  objects.push(makeObject("booth", 26, 9, { label: "Sponsor booth B" }));
  objects.push(makeObject("walkway", 14, 9, { label: "Central aisle" }));

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

/**
 * Kestrel Convention Centre, a tech conference expo hall.
 *
 * A larger and busier floor than the wedding. Three exits instead of two, two
 * blocks of exhibitor booths, marked aisles, and banquet seating in the south
 * half. It exists to show the rules holding on a floor where there is much
 * less slack, and to give the egress path rule something to chew on.
 */
function buildKestrel(): WorldState {
  const objects: FloorObject[] = [];

  objects.push(
    makeObject("stage", 16, 1, { label: "Keynote stage", locked: true })
  );
  objects.push(makeObject("exit", 6, 0, { label: "North exit", locked: true }));
  objects.push(
    makeObject("exit", 30, 23.6, { label: "South exit", locked: true })
  );
  objects.push(
    makeObject("exit", 0, 11, {
      label: "West exit",
      locked: true,
      vertical: true,
    })
  );

  objects.push(
    makeObject("rect_table", 4, 3, { label: "Registration desk A" })
  );
  objects.push(
    makeObject("rect_table", 7.5, 3, { label: "Registration desk B" })
  );
  objects.push(makeObject("bar", 33, 3, { label: "Coffee bar" }));

  let booth = 0;
  for (const y of [8, 12]) {
    for (const x of [3, 7, 11, 26, 30, 34]) {
      booth += 1;
      objects.push(
        makeObject("booth", x, y, { label: `Booth ${booth}` })
      );
    }
  }

  objects.push(makeObject("walkway", 17, 10, { label: "Central aisle" }));
  objects.push(makeObject("walkway", 28, 16, { label: "Expo aisle" }));

  let table = 0;
  for (const y of [16.5, 19.4]) {
    for (const x of [3, 5.9, 8.8, 11.7, 14.6, 17.5, 20.4, 23.3]) {
      table += 1;
      objects.push(makeObject("round_table", x, y, { label: `Table ${table}` }));
    }
  }

  return {
    floor: {
      name: "Kestrel Convention Centre",
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      capacity: 400,
    },
    objects,
    rules: builtinRules(),
  };
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "willowmere",
    name: "Willowmere Hall",
    subtitle: "Wedding reception, 30 x 20 m, half planned",
    build: buildWillowmere,
  },
  {
    id: "kestrel",
    name: "Kestrel Convention Centre",
    subtitle: "Conference expo hall, 40 x 24 m, three exits",
    build: buildKestrel,
  },
];

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].id;

export function loadScenario(id: string = DEFAULT_SCENARIO_ID): WorldState {
  const found = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  return found.build();
}
