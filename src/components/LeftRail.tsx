"use client";

import { CATALOG, KIND_ORDER } from "@/lib/catalog";
import { exportDrawingSvg, exportPlanJson } from "@/lib/exportPlan";
import { SCENARIOS } from "@/lib/scenario";
import {
  getState,
  loadScenarioById,
  removeObjectByHuman,
  resetAll,
  toggleLock,
} from "@/lib/store";
import { useAppState } from "@/lib/useStore";
import type { ObjectKind } from "@/lib/types";
import { IconLock, IconTrash } from "./icons";

interface Props {
  armed: ObjectKind | null;
  setArmed: (kind: ObjectKind | null) => void;
}

export default function LeftRail({ armed, setArmed }: Props) {
  const state = useAppState();
  const selected = state.world.objects.find((o) => o.id === state.selectedId);

  return (
    <aside className="rail-left">
      <div className="panel-head">
        <span className="panel-title">Palette</span>
      </div>
      <div className="palette">
        {KIND_ORDER.map((kind) => {
          const spec = CATALOG[kind];
          return (
            <button
              key={kind}
              className={`palette-item${armed === kind ? " armed" : ""}`}
              onClick={() => setArmed(armed === kind ? null : kind)}
              title={spec.description}
            >
              <span
                className={`swatch${spec.shape === "circle" ? " circle" : ""}`}
                style={{ background: spec.colour }}
              />
              <span>
                <span className="palette-label">{spec.label}</span>
                <br />
                <span className="palette-meta">
                  {spec.w} x {spec.h} m{spec.seats > 0 ? ` / ${spec.seats} seats` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="panel-head">
        <span className="panel-title">Selection</span>
      </div>
      {selected ? (
        <div className="inspector">
          <div
            style={{
              fontSize: "0.8125rem",
              marginBottom: "var(--cds-spacing-04)",
            }}
          >
            {selected.label}
          </div>
          <dl style={{ margin: 0 }}>
            <div className="kv">
              <dt>Position</dt>
              <dd>
                {selected.x}, {selected.y}
              </dd>
            </div>
            <div className="kv">
              <dt>Footprint</dt>
              <dd>
                {selected.w} x {selected.h}
              </dd>
            </div>
            <div className="kv">
              <dt>Seats</dt>
              <dd>{selected.seats}</dd>
            </div>
            <div className="kv">
              <dt>Status</dt>
              <dd style={{ color: selected.locked ? "var(--cc-locked)" : undefined }}>
                {selected.locked ? "locked" : "movable"}
              </dd>
            </div>
          </dl>
          <div style={{ display: "flex", gap: 1, marginTop: "var(--cds-spacing-04)" }}>
            <button
              className="btn small secondary"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => toggleLock(selected.id)}
            >
              <IconLock open={selected.locked} />
              {selected.locked ? "Unlock" : "Lock"}
            </button>
            <button
              className="btn small danger"
              onClick={() => removeObjectByHuman(selected.id)}
              disabled={selected.locked}
              title={
                selected.locked ? "Unlock it first" : "Remove from the floor"
              }
            >
              <IconTrash />
            </button>
          </div>
        </div>
      ) : (
        <div className="empty">
          Click an object on the floor to inspect it, lock it, or remove it.
          Locked objects cannot be touched by any agent tool call.
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div className="panel-head">
        <span className="panel-title">Scenario</span>
      </div>
      <div className="rail-footer">
        <select
          className="select"
          value={state.scenarioId}
          onChange={(e) => {
            const next = e.target.value;
            if (next === state.scenarioId) return;
            if (
              state.world.rules.some((r) => r.source !== "builtin") &&
              !confirm(
                "Loading another scenario clears the floor, the rulebook and the log. Continue?"
              )
            ) {
              return;
            }
            loadScenarioById(next);
          }}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="rail-hint">
          {SCENARIOS.find((s) => s.id === state.scenarioId)?.subtitle}
        </div>

        <div className="btn-row" style={{ marginTop: "var(--cds-spacing-04)" }}>
          <button
            className="btn small secondary"
            onClick={() => exportPlanJson(getState())}
            title="Download the floor, the rulebook with its provenance, the metrics and the activity log"
          >
            Export JSON
          </button>
          <button
            className="btn small secondary"
            onClick={() => exportDrawingSvg(getState())}
            title="Download the floor drawing as a standalone SVG"
          >
            Export SVG
          </button>
        </div>

        <button
          className="btn small secondary"
          style={{
            width: "100%",
            justifyContent: "center",
            marginTop: "var(--cds-spacing-03)",
          }}
          onClick={() => {
            if (confirm("Reset the floor, rulebook and log to the starting state?")) {
              resetAll();
            }
          }}
        >
          Reset scenario
        </button>
      </div>
    </aside>
  );
}
