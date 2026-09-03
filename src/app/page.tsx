"use client";

import { useEffect, useState } from "react";
import ActivityLog from "@/components/ActivityLog";
import AgentPanel from "@/components/AgentPanel";
import FloorCanvas from "@/components/FloorCanvas";
import LeftRail from "@/components/LeftRail";
import MetricsStrip from "@/components/MetricsStrip";
import RightRail from "@/components/RightRail";
import RuleCapture from "@/components/RuleCapture";
import { clearFlash } from "@/lib/store";
import { useAppState } from "@/lib/useStore";
import {
  connectBridge,
  refreshToolDescriptions,
  syncTools,
} from "@/webmcp/bridge";
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

  // When the rulebook changes, re-publish the tools that can change the floor
  // so their descriptions carry the narrowed contract. An agent reading the
  // surface after a correction is told about the rule rather than discovering
  // it by being refused.
  useEffect(() => {
    void refreshToolDescriptions();
  }, [state.world.rules]);

  // The spec fires toolchange whenever the accessible surface moves, which is
  // the correct signal for keeping the Tools panel honest.
  useEffect(() => {
    const mc = document.modelContext;
    if (!mc) return;
    const onChange = () => {
      void syncTools();
    };
    mc.addEventListener("toolchange", onChange);
    return () => mc.removeEventListener("toolchange", onChange);
  }, []);

  // Briefly outline whatever the human just accepted, then clear the marker.
  useEffect(() => {
    if (state.flash.length === 0) return;
    const t = setTimeout(clearFlash, 1400);
    return () => clearTimeout(t);
  }, [state.flash]);

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
            <AgentPanel />
          </div>
        </main>

        <RightRail />
      </div>

      <RuleCapture />
    </div>
  );
}
