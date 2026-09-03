"use client";

import { useEffect, useState } from "react";
import ActivityLog from "@/components/ActivityLog";
import FloorCanvas from "@/components/FloorCanvas";
import LeftRail from "@/components/LeftRail";
import MetricsStrip from "@/components/MetricsStrip";
import RightRail from "@/components/RightRail";
import RuleCapture from "@/components/RuleCapture";
import ToolSurface from "@/components/ToolSurface";
import { useAppState } from "@/lib/useStore";
import { connectBridge } from "@/webmcp/bridge";
import type { ObjectKind } from "@/lib/types";
import "./app.css";

const BRIDGE_COPY: Record<string, { label: string; title: string }> = {
  native: {
    label: "WebMCP live",
    title:
      "This browser exposes document.modelContext natively. Tools are registered on the real surface.",
  },
  shim: {
    label: "WebMCP stand-in",
    title:
      "This browser does not expose document.modelContext. The page installed an identical local surface so the built in agent still works. Open in Chrome with chrome://flags/#enable-webmcp-testing, or in an agent browser, for the real thing.",
  },
  none: {
    label: "No tool surface",
    title: "Neither the native surface nor the local stand-in could be installed.",
  },
};

export default function Home() {
  const state = useAppState();
  const [armed, setArmed] = useState<ObjectKind | null>(null);

  useEffect(() => {
    void connectBridge();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const bridge = BRIDGE_COPY[state.bridge.mode];

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          ConstraintCanvas
          <span>{state.world.floor.name}</span>
        </div>
        <span
          className={`chip is-${state.bridge.mode}`}
          title={bridge.title}
        >
          <span className="chip-dot" />
          {bridge.label}
          <span style={{ opacity: 0.7 }}>{state.bridge.tools.length} tools</span>
        </span>
        <div className="header-spacer" />
        <MetricsStrip />
      </header>

      <div className="body">
        <LeftRail armed={armed} setArmed={setArmed} />

        <main className="centre">
          <FloorCanvas armed={armed} onPlaced={() => setArmed(null)} />
          <div className="dock">
            <ActivityLog />
            <section className="dock-pane">
              <div className="panel-head">
                <span className="panel-title">Published tool surface</span>
              </div>
              <ToolSurface />
            </section>
          </div>
        </main>

        <RightRail />
      </div>

      <RuleCapture />
    </div>
  );
}
