"use client";

import { useEffect, useRef } from "react";
import { computeMetrics } from "@/lib/metrics";
import { useAppState } from "@/lib/useStore";

function Metric({
  label,
  value,
  tone,
  delta,
}: {
  label: string;
  value: string;
  tone?: "warn" | "good";
  delta?: number;
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value${tone ? ` ${tone}` : ""}`}>
        {value}
        {delta !== undefined && delta !== 0 && (
          <span className="metric-delta"> {delta > 0 ? `+${delta}` : delta}</span>
        )}
      </div>
    </div>
  );
}

export default function MetricsStrip() {
  const state = useAppState();
  const m = computeMetrics(state.world);
  const startSeats = useRef<number | null>(null);
  if (startSeats.current === null) startSeats.current = m.seats;

  // Reset the baseline when the scenario is reloaded from scratch.
  useEffect(() => {
    if (state.log.length === 0) startSeats.current = m.seats;
  }, [state.log.length, m.seats]);

  return (
    <div className="metrics">
      <Metric
        label="Seats"
        value={`${m.seats}`}
        delta={m.seats - (startSeats.current ?? m.seats)}
      />
      <Metric label="Capacity" value={`${m.capacity}`} />
      <Metric label="Utilisation" value={`${m.utilisationPct}%`} />
      <Metric label="Circulation" value={`${m.circulationPct}%`} />
      <Metric
        label="Furthest to exit"
        value={m.furthestSeatToExitM === null ? "n/a" : `${m.furthestSeatToExitM} m`}
      />
      <Metric
        label="Violations"
        value={`${m.violationCount}`}
        tone={m.violationCount > 0 ? "warn" : "good"}
      />
      <Metric
        label="Rules"
        value={`${state.world.rules.filter((r) => r.enabled).length}`}
      />
    </div>
  );
}
