"use client";

import { useState } from "react";
import { TOOLS } from "@/webmcp/tools";
import { useAppState } from "@/lib/useStore";

const GROUP_LABEL: Record<string, string> = {
  inspection: "Inspection",
  proposal: "Proposal",
  explanation: "Explanation",
  authoring: "Constraint authoring",
};

/**
 * Lists the tools this page publishes, grouped the way the agent sees them.
 * Registration is reported honestly: a tool only appears as live if the
 * browser surface came back with its name.
 */
export default function ToolSurface() {
  const state = useAppState();
  const [open, setOpen] = useState<string | null>(null);
  const live = new Set(state.bridge.tools);

  const groups = ["inspection", "proposal", "explanation", "authoring"];

  return (
    <div className="panel-body">
      {groups.map((group) => (
        <div key={group}>
          <div
            className="empty"
            style={{
              padding: "var(--cds-spacing-03) var(--cds-spacing-05)",
              borderBottom: "1px solid var(--cds-border-subtle-00)",
              textTransform: "uppercase",
              letterSpacing: "0.32px",
              fontWeight: 600,
              color: "var(--cds-text-secondary)",
            }}
          >
            {GROUP_LABEL[group]}
          </div>
          {TOOLS.filter((t) => t.group === group).map((t) => (
            <div
              key={t.name}
              className="log-row"
              style={{ cursor: "pointer", display: "block" }}
              onClick={() => setOpen(open === t.name ? null : t.name)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="chip-dot"
                  style={{
                    color: live.has(t.name)
                      ? "var(--cds-support-success)"
                      : "var(--cds-text-disabled)",
                  }}
                />
                <span className="log-tool">{t.name}</span>
                <span className="tag">{t.readOnly ? "read only" : "writes"}</span>
              </div>
              {open === t.name && (
                <div className="log-detail" style={{ marginTop: 6 }}>
                  {t.description}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
