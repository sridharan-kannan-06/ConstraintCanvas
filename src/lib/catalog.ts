import type { ObjectKind } from "./types";

export interface KindSpec {
  kind: ObjectKind;
  label: string;
  /** Default footprint in metres. Objects are not resizable in this build. */
  w: number;
  h: number;
  seats: number;
  shape: "rect" | "circle";
  colour: string;
  /** Whether the object contributes seated occupants that need an egress path. */
  seating: boolean;
  description: string;
}

export const CATALOG: Record<ObjectKind, KindSpec> = {
  stage: {
    kind: "stage",
    label: "Stage",
    w: 8,
    h: 4,
    seats: 0,
    shape: "rect",
    colour: "#8a3ffc",
    seating: false,
    description: "Raised performance platform. Blocks circulation on all sides.",
  },
  round_table: {
    kind: "round_table",
    label: "Round table",
    w: 1.8,
    h: 1.8,
    seats: 8,
    shape: "circle",
    colour: "#4589ff",
    seating: true,
    description: "Banquet round seating eight guests.",
  },
  rect_table: {
    kind: "rect_table",
    label: "Rect table",
    w: 2.4,
    h: 0.8,
    seats: 6,
    shape: "rect",
    colour: "#33b1ff",
    seating: true,
    description: "Trestle table seating six guests.",
  },
  booth: {
    kind: "booth",
    label: "Booth",
    w: 3,
    h: 2,
    seats: 0,
    shape: "rect",
    colour: "#08bdba",
    seating: false,
    description: "Sponsor or exhibitor booth with a display frontage.",
  },
  bar: {
    kind: "bar",
    label: "Bar",
    w: 4,
    h: 1,
    seats: 0,
    shape: "rect",
    colour: "#ff832b",
    seating: false,
    description: "Service bar. Draws standing crowds so it needs generous clearance.",
  },
  exit: {
    kind: "exit",
    label: "Exit",
    w: 1.6,
    h: 0.4,
    seats: 0,
    shape: "rect",
    colour: "#42be65",
    seating: false,
    description: "Egress door. Must stay unobstructed and reachable from every seat.",
  },
  walkway: {
    kind: "walkway",
    label: "Walkway",
    w: 6,
    h: 2,
    seats: 0,
    shape: "rect",
    colour: "#6f6f6f",
    seating: false,
    description: "Marked circulation corridor. Nothing may be placed inside it.",
  },
};

export const KIND_ORDER: ObjectKind[] = [
  "stage",
  "round_table",
  "rect_table",
  "booth",
  "bar",
  "exit",
  "walkway",
];

export function specFor(kind: ObjectKind): KindSpec {
  return CATALOG[kind];
}
