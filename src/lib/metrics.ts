import { centreDistance, rectOf, round1 } from "./geometry";
import { evaluateWorld } from "./rules";
import type { Metrics, WorldState } from "./types";

export function computeMetrics(world: WorldState): Metrics {
  const { floor, objects } = world;
  const floorAreaM2 = floor.widthM * floor.heightM;
  const usedAreaM2 = objects
    .filter((o) => o.kind !== "exit")
    .reduce((sum, o) => sum + o.w * o.h, 0);
  const seats = objects.reduce((n, o) => n + o.seats, 0);
  const exits = objects.filter((o) => o.kind === "exit");
  const seated = objects.filter((o) => o.seats > 0);

  let furthest: number | null = null;
  if (exits.length > 0 && seated.length > 0) {
    furthest = Math.max(
      ...seated.map((o) =>
        Math.min(...exits.map((e) => centreDistance(rectOf(o), rectOf(e))))
      )
    );
  }

  return {
    seats,
    capacity: floor.capacity,
    floorAreaM2: round1(floorAreaM2),
    usedAreaM2: round1(usedAreaM2),
    utilisationPct: Math.round((usedAreaM2 / floorAreaM2) * 100),
    circulationPct: Math.round(((floorAreaM2 - usedAreaM2) / floorAreaM2) * 100),
    furthestSeatToExitM: furthest === null ? null : round1(furthest),
    violationCount: evaluateWorld(world).length,
  };
}
