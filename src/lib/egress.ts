import type { Floor, FloorObject } from "./types";

/**
 * Occupancy and reachability on the floor grid. Straight line distance to an
 * exit is not the same as being able to reach one, since a table can sit six
 * metres from a door and still be walled in behind a row of booths. A flood
 * fill outward from the exits answers the second question.
 */

export interface EgressGrid {
  cols: number;
  rows: number;
  cell: number;
  /** True where furniture blocks movement. */
  blocked: Uint8Array;
  /** True where a walker starting at an exit can get to. */
  reachable: Uint8Array;
}

function index(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/**
 * A cell counts as blocked when its centre falls inside an object. Testing the
 * centre rather than any overlap keeps narrow but genuinely walkable gaps
 * open, which matters because the clearance rule only guarantees 0.9 m.
 */
export function buildEgressGrid(
  objects: FloorObject[],
  floor: Floor
): EgressGrid {
  const cell = floor.gridM;
  const cols = Math.max(1, Math.round(floor.widthM / cell));
  const rows = Math.max(1, Math.round(floor.heightM / cell));
  const blocked = new Uint8Array(cols * rows);

  // Only the cells an object could touch are visited. The optimiser rebuilds
  // this grid per candidate position, so a full scan per object would dominate
  // its running time.
  for (const o of objects) {
    if (o.kind === "exit") continue;
    const c0 = Math.max(0, Math.floor(o.x / cell));
    const c1 = Math.min(cols - 1, Math.ceil((o.x + o.w) / cell));
    const r0 = Math.max(0, Math.floor(o.y / cell));
    const r1 = Math.min(rows - 1, Math.ceil((o.y + o.h) / cell));
    for (let row = r0; row <= r1; row++) {
      const cy = (row + 0.5) * cell;
      if (cy < o.y || cy > o.y + o.h) continue;
      for (let col = c0; col <= c1; col++) {
        const cx = (col + 0.5) * cell;
        if (cx < o.x || cx > o.x + o.w) continue;
        blocked[index(col, row, cols)] = 1;
      }
    }
  }

  const reachable = new Uint8Array(cols * rows);
  const queue: number[] = [];

  // Exits seed the fill. A doorway is a way out, not an obstacle, so any free
  // cell touching an exit footprint starts the search.
  for (const o of objects) {
    if (o.kind !== "exit") continue;
    const c0 = Math.max(0, Math.floor((o.x - cell) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((o.x + o.w + cell) / cell));
    const r0 = Math.max(0, Math.floor((o.y - cell) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((o.y + o.h + cell) / cell));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = index(col, row, cols);
        if (blocked[i] || reachable[i]) continue;
        reachable[i] = 1;
        queue.push(i);
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const col = i % cols;
    const row = (i - col) / cols;
    const neighbours = [
      col > 0 ? i - 1 : -1,
      col < cols - 1 ? i + 1 : -1,
      row > 0 ? i - cols : -1,
      row < rows - 1 ? i + cols : -1,
    ];
    for (const n of neighbours) {
      if (n < 0 || blocked[n] || reachable[n]) continue;
      reachable[n] = 1;
      queue.push(n);
    }
  }

  return { cols, rows, cell, blocked, reachable };
}

/**
 * Whether a walker leaving this object can get to an exit, judged by the ring
 * of cells immediately around its footprint.
 */
export function hasEgressPath(o: FloorObject, grid: EgressGrid): boolean {
  const { cols, rows, cell, blocked, reachable } = grid;
  const c0 = Math.max(0, Math.floor((o.x - cell) / cell));
  const c1 = Math.min(cols - 1, Math.floor((o.x + o.w + cell) / cell));
  const r0 = Math.max(0, Math.floor((o.y - cell) / cell));
  const r1 = Math.min(rows - 1, Math.floor((o.y + o.h + cell) / cell));

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = index(col, row, cols);
      if (!blocked[i] && reachable[i]) return true;
    }
  }
  return false;
}

/** Share of the floor left free, used by the circulation rule and the metrics. */
export function freeAreaRatio(objects: FloorObject[], floor: Floor): number {
  const total = floor.widthM * floor.heightM;
  const used = objects
    .filter((o) => o.kind !== "exit")
    .reduce((sum, o) => sum + o.w * o.h, 0);
  return total === 0 ? 1 : Math.max(0, (total - used) / total);
}
