"use client";

import {
  confirmCapture,
  dismissCapture,
  selectCandidate,
  updateCapture,
} from "@/lib/store";
import { useAppState } from "@/lib/useStore";

/**
 * The rule capture dialog. A rejection is not thrown away here, it is turned
 * into a named constraint with its origin recorded. The human confirms or
 * edits, and only then does it become something the tool boundary enforces.
 */
export default function RuleCapture() {
  const state = useAppState();
  const capture = state.capture;
  if (!capture) return null;

  const candidate = capture.candidates.find(
    (c) => c.id === capture.selectedCandidateId
  );
  const knob = candidate?.knob;

  const step = (direction: 1 | -1) => {
    if (!knob || capture.meters === null) return;
    const next = Math.min(
      knob.max,
      Math.max(knob.min, Math.round((capture.meters + direction * knob.step) * 10) / 10)
    );
    updateCapture({ meters: next });
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">
            {capture.origin === "rejection"
              ? "Turn this rejection into a rule"
              : "Confirm the rule the agent drafted"}
          </div>
          <div className="modal-sub">{capture.trigger}</div>
        </div>

        <div className="modal-body">
          {capture.candidates.length > 1 && (
            <>
              <span className="field-label">
                Which of these did you actually mean?
              </span>
              <div style={{ marginBottom: "var(--cds-spacing-06)" }}>
                {capture.candidates.map((c) => (
                  <button
                    key={c.id}
                    className={`candidate${
                      c.id === capture.selectedCandidateId ? " selected" : ""
                    }`}
                    onClick={() => selectCandidate(c.id)}
                  >
                    <span className="radio" />
                    <span>
                      <span className="candidate-statement">{c.statement}</span>
                      <span className="candidate-rationale">{c.rationale}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {knob && capture.meters !== null && (
            <div style={{ marginBottom: "var(--cds-spacing-06)" }}>
              <span className="field-label">{knob.label}</span>
              <div className="stepper">
                <button onClick={() => step(-1)} aria-label="Decrease">
                  &minus;
                </button>
                <span className="stepper-value">
                  {capture.meters.toFixed(1)} m
                </span>
                <button onClick={() => step(1)} aria-label="Increase">
                  +
                </button>
              </div>
            </div>
          )}

          <label className="field-label" htmlFor="rule-statement">
            The rule as it will read in the rulebook
          </label>
          <input
            id="rule-statement"
            className="text-input"
            value={capture.statement}
            onChange={(e) => updateCapture({ statement: e.target.value })}
          />
          <div
            className="candidate-rationale"
            style={{ marginTop: "var(--cds-spacing-04)" }}
          >
            Once confirmed, every future agent proposal is checked against this
            before it can be shown to you. You can waive or revoke it at any time
            from the rulebook.
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn secondary" onClick={dismissCapture}>
            Just this once
          </button>
          <button className="btn" onClick={confirmCapture}>
            Add to rulebook
          </button>
        </div>
      </div>
    </div>
  );
}
