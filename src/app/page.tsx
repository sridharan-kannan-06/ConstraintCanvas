"use client";

import { useEffect, useRef, useState } from "react";
import ActivityLog from "@/components/ActivityLog";
import AgentPanel from "@/components/AgentPanel";
import FloorCanvas from "@/components/FloorCanvas";
import LeftRail from "@/components/LeftRail";
import MetricsStrip from "@/components/MetricsStrip";
import RightRail from "@/components/RightRail";
import RuleCapture from "@/components/RuleCapture";
import { clearFlash, undo, undoLabel } from "@/lib/store";
import { useAppState } from "@/lib/useStore";
import {
  connectBridge,
  refreshToolDescriptions,
  subscribeToolChange,
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
  // Dock height in pixels. Draggable, with the expand control snapping between
  // a working height and a reading height.
  const [dockHeight, setDockHeight] = useState(260);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const expanded = dockHeight > 460;

  const onSplitterDown = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, startH: dockHeight };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onSplitterMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = drag.startH + (drag.startY - e.clientY);
    setDockHeight(Math.max(140, Math.min(window.innerHeight - 220, next)));
  };
  const endSplitter = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    void connectBridge();
  }, []);

  // When the rulebook changes, re-publish the tools that can change the floor
  // so their descriptions carry the current constraints.
  useEffect(() => {
    void refreshToolDescriptions();
  }, [state.world.rules]);

  // Not every surface offers toolchange, so the subscription is feature
  // detected.
  useEffect(() => subscribeToolChange(() => void syncTools()), []);

  // Briefly outline whatever the human just accepted, then clear the marker.
  useEffect(() => {
    if (state.flash.length === 0) return;
    const t = setTimeout(clearFlash, 1400);
    return () => clearTimeout(t);
  }, [state.flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(null);
      const typing =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
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
        <button
          className="btn small secondary"
          onClick={undo}
          disabled={state.history.length === 0}
          title={
            state.history.length === 0
              ? "Nothing to undo"
              : `Undo ${undoLabel()} (Ctrl+Z)`
          }
        >
          Undo
          {state.history.length > 0 && (
            <span className="palette-meta">{state.history.length}</span>
          )}
        </button>
        <div className="header-spacer" />
        <MetricsStrip />
      </header>

      <div className="body">
        <LeftRail armed={armed} setArmed={setArmed} />

        <main className="centre">
          <FloorCanvas armed={armed} onPlaced={() => setArmed(null)} />
          <div
            className="splitter"
            onPointerDown={onSplitterDown}
            onPointerMove={onSplitterMove}
            onPointerUp={endSplitter}
            onPointerCancel={endSplitter}
            role="separator"
            aria-label="Resize the panel below the canvas"
          >
            <span className="splitter-grip" />
          </div>
          <div className="dock" style={{ flexBasis: dockHeight }}>
            <ActivityLog />
            <AgentPanel
              expanded={expanded}
              onToggleExpand={() =>
                setDockHeight(
                  expanded ? 260 : Math.round(window.innerHeight * 0.55)
                )
              }
            />
          </div>
        </main>

        <RightRail />
      </div>

      <RuleCapture />

      <div className="narrow-notice">
        ConstraintCanvas is built for a desktop window. Below about 1100 px the
        canvas and the rulebook cannot both stay legible, so the page scrolls
        sideways rather than reflowing. Widen the window for the intended layout.
      </div>
    </div>
  );
}
