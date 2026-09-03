"use client";

import { useEffect, useState } from "react";
import { TOOLS } from "@/webmcp/tools";
import { useAppState } from "@/lib/useStore";

const GROUP_LABEL: Record<string, string> = {
  inspection: "Inspection",
  proposal: "Proposal",
  explanation: "Explanation",
  authoring: "Constraint authoring",
};

const GROUPS = ["inspection", "proposal", "explanation", "authoring"];

/**
 * Lists the tools this page publishes, grouped the way the agent sees them.
 *
 * Descriptions are read back off the live surface rather than from the local
 * descriptors, so the panel shows the contract as it currently stands. The
 * proposal tools carry the human authored rules in their own description, and
 * this is where you can watch that text grow.
 */
export default function ToolSurface() {
  const state = useAppState();
  const [open, setOpen] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, string>>({});

  useEffect(() => {
    const mc = document.modelContext;
    if (!mc) return;
    void mc.getTools().then((tools) => {
      setLive(
        Object.fromEntries(tools.map((t) => [t.name, t.description ?? ""]))
      );
    });
  }, [state.bridge.tools, state.world.rules]);

  const registered = new Set(state.bridge.tools);

  return (
    <div className="panel-body">
      {GROUPS.map((group) => (
        <div key={group}>
          <div className="tool-group">{GROUP_LABEL[group]}</div>
          {TOOLS.filter((t) => t.group === group).map((t) => (
            <div
              key={t.name}
              className="tool-row"
              onClick={() => setOpen(open === t.name ? null : t.name)}
            >
              <div className="tool-row-top">
                <span
                  className="chip-dot"
                  style={{
                    color: registered.has(t.name)
                      ? "var(--cds-support-success)"
                      : "var(--cds-text-disabled)",
                  }}
                />
                <span className="log-tool">{t.name}</span>
                <div className="header-spacer" />
                <span className="tag">
                  {t.readOnly ? "read only" : "writes"}
                </span>
              </div>
              {open === t.name && (
                <div className="tool-description">
                  {live[t.name] ?? t.description}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
