"use client";

import { useAppState } from "@/lib/useStore";

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function ActivityLog() {
  const state = useAppState();
  const calls = state.log.filter((e) => e.kind === "tool_call").length;
  const refusals = state.log.filter((e) => e.kind === "tool_refusal").length;

  return (
    <section className="dock-pane">
      <div className="panel-head">
        <span className="panel-title">Activity log</span>
        <div className="header-spacer" />
        <span className="tag">{calls} calls</span>
        <span className={`tag${refusals > 0 ? " danger" : ""}`}>
          {refusals} refused
        </span>
      </div>
      <div className="panel-body">
        {state.log.length === 0 ? (
          <div className="empty">
            Every tool call, refusal, approval and rejection lands here as it
            happens.
          </div>
        ) : (
          state.log.map((e) => (
            <div className="log-row" key={e.id}>
              <span className="log-time">{clock(e.at)}</span>
              <span className={`log-bar ${e.kind}`} />
              <span className="log-main">
                <span className="log-msg">
                  {e.tool && <span className="log-tool">{e.tool} </span>}
                  {e.message}
                </span>
                {e.detail && <div className="log-detail">{e.detail}</div>}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
