import type { FloorObject, Rect } from "./types";

export function rectOf(o: FloorObject): Rect {
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

export function centreOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Shortest distance between the edges of two axis aligned rectangles.
 * Returns 0 when they touch or overlap.
 */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.hypot(dx, dy);
}

export function centreDistance(a: Rect, b: Rect): number {
  const ca = centreOf(a);
  const cb = centreOf(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function fmtM(value: number): string {
  return `${round1(value).toFixed(1)} m`;
}

/**
 * Names the region of the floor a point falls in, using a three by three split.
 * Used when phrasing zone rules in the language a planner would actually use.
 */
export function regionName(
  x: number,
  y: number,
  widthM: number,
  heightM: number
): string {
  const col = x < widthM / 3 ? "west" : x < (widthM * 2) / 3 ? "central" : "east";
  const row = y < heightM / 3 ? "north" : y < (heightM * 2) / 3 ? "middle" : "south";
  if (col === "central" && row === "middle") return "centre";
  if (col === "central") return row;
  if (row === "middle") return col;
  return `${row}-${col}`;
}

/**
 * Returns the bounding rectangle of the named region produced by regionName,
 * snapped to half metres so rule statements and the drawn overlay agree.
 */
export function regionRect(name: string, widthM: number, heightM: number): Rect {
  const half = (v: number) => Math.round(v * 2) / 2;
  const colIndex = name.includes("west") ? 0 : name.includes("east") ? 2 : 1;
  const rowIndex = name.includes("north") ? 0 : name.includes("south") ? 2 : 1;
  const x = half((colIndex * widthM) / 3);
  const y = half((rowIndex * heightM) / 3);
  return {
    x,
    y,
    w: half(((colIndex + 1) * widthM) / 3) - x,
    h: half(((rowIndex + 1) * heightM) / 3) - y,
  };
}
