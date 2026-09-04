"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, specFor } from "@/lib/catalog";
import { round1, snap } from "@/lib/geometry";
import { evaluateWorld } from "@/lib/rules";
import {
  addObjectByHuman,
  beginMove,
  log,
  moveObjectByHuman,
  selectObject,
} from "@/lib/store";
import { useAppState } from "@/lib/useStore";
import type { FloorObject, ObjectKind, Rect } from "@/lib/types";

interface Ghost {
  key: string;
  kind: ObjectKind;
  label: string;
  /** Short form drawn on the shape. Full wording lives in the proposal tray. */
  short: string;
  rect: Rect;
  mode: "add" | "move";
}

interface Props {
  armed: ObjectKind | null;
  onPlaced: () => void;
}

export default function FloorCanvas({ armed, onPlaced }: Props) {
  const state = useAppState();
  const { floor, objects, rules } = state.world;
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(24);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 32;
      const w = el.clientWidth - pad * 2;
      const h = el.clientHeight - pad * 2;
      setScale(Math.max(6, Math.min(w / floor.widthM, h / floor.heightM)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [floor.widthM, floor.heightM]);

  const violations = useMemo(() => evaluateWorld(state.world), [state.world]);
  const violatingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const v of violations) for (const id of v.objectIds) ids.add(id);
    return ids;
  }, [violations]);

  /* Pending proposal items become ghosts drawn over the live floor. */
  const { ghosts, movingIds, removingIds } = useMemo(() => {
    const g: Ghost[] = [];
    const moving = new Set<string>();
    const removing = new Set<string>();
    const pending = state.pending;
    if (pending) {
      for (const item of pending.items) {
        if (item.status !== "pending") continue;
        const c = item.change;
        if (c.op === "add") {
          const spec = specFor(c.kind);
          g.push({
            key: item.id,
            kind: c.kind,
            label: c.label ?? spec.label,
            short: spec.seats > 0 ? `+${spec.seats}` : "new",
            rect: { x: c.x, y: c.y, w: spec.w, h: spec.h },
            mode: "add",
          });
        } else if (c.op === "move") {
          const existing = objects.find((o) => o.id === c.id);
          if (!existing) continue;
          moving.add(existing.id);
          g.push({
            key: item.id,
            kind: existing.kind,
            label: existing.label,
            short: "moved",
            rect: { x: c.x, y: c.y, w: existing.w, h: existing.h },
            mode: "move",
          });
        } else {
          removing.add(c.id);
        }
      }
    }
    return { ghosts: g, movingIds: moving, removingIds: removing };
  }, [state.pending, objects]);

  /* Zones from active keep_out_zone rules, drawn so the human can see them. */
  const zones = useMemo(
    () =>
      rules
        .filter((r) => r.enabled && r.kind === "keep_out_zone" && r.params.zone)
        .map((r) => ({
          id: r.id,
          rect: r.params.zone as Rect,
          name: r.params.zoneName ?? "reserved",
          source: r.source,
        })),
    [rules]
  );

  /* Clearance rules drawn as haloes around the object they protect. */
  const haloes = useMemo(() => {
    const out: Array<{
      key: string;
      rect: Rect;
      metres: number;
      colour: string;
      dashed: boolean;
    }> = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const metres = rule.params.meters;
      if (!metres) continue;

      let anchors: FloorObject[] = [];
      if (rule.kind === "exit_clearance") {
        anchors = objects.filter((o) => o.kind === "exit");
      } else if (rule.kind === "keep_clear_of") {
        anchors = rule.params.anchorId
          ? objects.filter((o) => o.id === rule.params.anchorId)
          : objects.filter((o) =>
              (rule.params.fromKinds ?? []).includes(o.kind)
            );
      } else {
        continue;
      }

      const colour =
        rule.source === "builtin" ? "var(--cds-support-success)" : "var(--cc-proposal)";
      for (const a of anchors) {
        out.push({
          key: `${rule.id}-${a.id}`,
          rect: {
            x: a.x - metres,
            y: a.y - metres,
            w: a.w + metres * 2,
            h: a.h + metres * 2,
          },
          metres,
          colour,
          dashed: rule.source !== "builtin",
        });
      }
    }
    return out;
  }, [rules, objects]);

  const toMetres = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const box = svg.getBoundingClientRect();
      return {
        x: (clientX - box.left) / scale,
        y: (clientY - box.top) / scale,
      };
    },
    [scale]
  );

  const onPointerDownObject = (e: React.PointerEvent, o: FloorObject) => {
    e.stopPropagation();
    selectObject(o.id);
    if (o.locked) return;
    const p = toMetres(e.clientX, e.clientY);
    beginMove(o.id);
    dragRef.current = { id: o.id, dx: p.x - o.x, dy: p.y - o.y };
    setDraggingId(o.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toMetres(e.clientX, e.clientY);
    const drag = dragRef.current;
    if (drag) {
      moveObjectByHuman(drag.id, p.x - drag.dx, p.y - drag.dy);
      return;
    }
    if (armed) {
      const spec = specFor(armed);
      setHover({
        x: round1(snap(p.x - spec.w / 2, floor.gridM)),
        y: round1(snap(p.y - spec.h / 2, floor.gridM)),
      });
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag) {
      const moved = objects.find((o) => o.id === drag.id);
      if (moved) log("human_edit", "human", `Moved ${moved.label} to ${moved.x}, ${moved.y}.`);
    }
    dragRef.current = null;
    setDraggingId(null);
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!armed) {
      selectObject(null);
      return;
    }
    const p = toMetres(e.clientX, e.clientY);
    const spec = specFor(armed);
    addObjectByHuman(armed, p.x - spec.w / 2, p.y - spec.h / 2);
    onPlaced();
    setHover(null);
  };

  const W = floor.widthM * scale;
  const H = floor.heightM * scale;
  const gridPx = floor.gridM * scale;
  const majorEvery = 1 / floor.gridM;

  const renderShape = (
    kind: ObjectKind,
    rect: Rect,
    props: React.SVGProps<SVGRectElement & SVGCircleElement>
  ) => {
    const x = rect.x * scale;
    const y = rect.y * scale;
    const w = rect.w * scale;
    const h = rect.h * scale;
    if (CATALOG[kind].shape === "circle") {
      return (
        <circle
          cx={x + w / 2}
          cy={y + h / 2}
          r={Math.min(w, h) / 2}
          {...(props as React.SVGProps<SVGCircleElement>)}
        />
      );
    }
    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        {...(props as React.SVGProps<SVGRectElement>)}
      />
    );
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      {armed && (
        <div className="canvas-hint">
          Click the floor to place a {CATALOG[armed].label.toLowerCase()}. Press
          Escape to cancel.
        </div>
      )}
      <svg
        ref={svgRef}
        id="floor-canvas"
        width={W}
        height={H}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          endDrag();
          setHover(null);
        }}
        onClick={onCanvasClick}
        style={{ display: "block", touchAction: "none" }}
      >
        <defs>
          <pattern id="grid" width={gridPx} height={gridPx} patternUnits="userSpaceOnUse">
            <path
              d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`}
              fill="none"
              stroke="var(--cc-grid)"
              strokeWidth="1"
            />
          </pattern>
          <pattern
            id="gridMajor"
            width={gridPx * majorEvery}
            height={gridPx * majorEvery}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridPx * majorEvery} 0 L 0 0 0 ${gridPx * majorEvery}`}
              fill="none"
              stroke="var(--cc-grid-major)"
              strokeWidth="1"
            />
          </pattern>
          <pattern
            id="zoneHatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--cc-proposal)" strokeWidth="2" />
          </pattern>
          <pattern
            id="walkHatch"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="10" height="10" fill="#2f2f2f" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="#4a4a4a" strokeWidth="3" />
          </pattern>
        </defs>

        <rect x={0} y={0} width={W} height={H} fill="var(--cc-floor)" />
        <rect x={0} y={0} width={W} height={H} fill="url(#grid)" />
        <rect x={0} y={0} width={W} height={H} fill="url(#gridMajor)" />

        {zones.map((z) => (
          <g key={z.id}>
            <rect
              x={z.rect.x * scale}
              y={z.rect.y * scale}
              width={z.rect.w * scale}
              height={z.rect.h * scale}
              fill="url(#zoneHatch)"
              opacity={0.12}
            />
            <rect
              x={z.rect.x * scale}
              y={z.rect.y * scale}
              width={z.rect.w * scale}
              height={z.rect.h * scale}
              fill="none"
              stroke="var(--cc-proposal)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity={0.5}
            />
          </g>
        ))}

        {haloes.map((h) => (
          <rect
            key={h.key}
            x={h.rect.x * scale}
            y={h.rect.y * scale}
            width={h.rect.w * scale}
            height={h.rect.h * scale}
            rx={h.metres * scale}
            fill="none"
            stroke={h.colour}
            strokeWidth="1"
            strokeDasharray={h.dashed ? "5 4" : "2 4"}
            opacity={0.45}
            pointerEvents="none"
          />
        ))}

        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="none"
          stroke="var(--cds-border-strong-01)"
          strokeWidth="2"
        />

        {objects.map((o) => {
          const spec = CATALOG[o.kind];
          const bad = violatingIds.has(o.id);
          const selected = state.selectedId === o.id;
          const fading = movingIds.has(o.id) || removingIds.has(o.id);
          const x = o.x * scale;
          const y = o.y * scale;
          const w = o.w * scale;
          const h = o.h * scale;
          // Circles carry their text in the middle, rectangles in the top
          // left. A round table is 1.8 m across, so a top left label would sit
          // half outside the shape.
          const isCircle = spec.shape === "circle";
          const showLabel = isCircle ? w > 34 : w > 46 && h > 22;
          const textX = isCircle ? x + w / 2 : x + 4;
          const textAnchor = isCircle ? "middle" : "start";

          return (
            <g
              key={o.id}
              className={`obj${o.locked ? " locked" : ""}${
                draggingId === o.id ? " dragging" : ""
              }`}
              opacity={fading ? 0.28 : 1}
              onPointerDown={(e) => onPointerDownObject(e, o)}
              onClick={(e) => e.stopPropagation()}
            >
              {bad &&
                renderShape(o.kind, o, {
                  fill: "none",
                  stroke: "var(--cc-violation)",
                  strokeWidth: 8,
                  className: "violation-glow",
                })}
              {state.flash.includes(o.id) &&
                renderShape(o.kind, o, {
                  fill: "none",
                  stroke: "#ffffff",
                  strokeWidth: 6,
                  opacity: 0.7,
                  className: "violation-glow",
                })}
              {renderShape(o.kind, o, {
                fill: o.kind === "walkway" ? "url(#walkHatch)" : spec.colour,
                fillOpacity: o.kind === "walkway" ? 1 : 0.82,
                stroke: o.locked
                  ? "var(--cc-locked)"
                  : selected
                    ? "#ffffff"
                    : o.kind === "walkway"
                      ? "#5a5a5a"
                      : "rgba(0,0,0,0.45)",
                strokeWidth: o.locked ? 2.5 : selected ? 2 : 1,
                strokeDasharray: o.kind === "walkway" ? "6 4" : undefined,
              })}
              {o.kind === "exit" && (
                <>
                  <rect
                    x={x - 1.5}
                    y={y - 1.5}
                    width={w + 3}
                    height={h + 3}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                  <text
                    className="obj-sub"
                    x={x + w / 2}
                    y={y < H / 2 ? y + h + 12 : y - 5}
                    textAnchor="middle"
                    fill="var(--cds-support-success)"
                  >
                    {o.label}
                  </text>
                </>
              )}
              {removingIds.has(o.id) && (
                <line
                  x1={x}
                  y1={y}
                  x2={x + w}
                  y2={y + h}
                  stroke="var(--cc-violation)"
                  strokeWidth="2"
                />
              )}
              {showLabel && (
                <text
                  className="obj-label"
                  x={textX}
                  y={isCircle ? y + h / 2 - 1 : y + 13}
                  textAnchor={textAnchor}
                >
                  {o.label}
                </text>
              )}
              {showLabel && o.seats > 0 && (isCircle ? h > 40 : h > 34) && (
                <text
                  className="obj-sub"
                  x={textX}
                  y={isCircle ? y + h / 2 + 11 : y + 25}
                  textAnchor={textAnchor}
                >
                  {o.seats} seats
                </text>
              )}
              {o.locked && (
                <g pointerEvents="none">
                  <circle
                    cx={x + w - 8}
                    cy={y + 8}
                    r={6.5}
                    fill="var(--cc-locked)"
                  />
                  <rect
                    x={x + w - 10.5}
                    y={y + 6.5}
                    width={5}
                    height={4}
                    fill="#161616"
                  />
                  <path
                    d={`M ${x + w - 9.5} ${y + 6.5} a 1.5 1.5 0 0 1 3 0`}
                    fill="none"
                    stroke="#161616"
                    strokeWidth="1.2"
                  />
                </g>
              )}
            </g>
          );
        })}

        {ghosts.map((g) => (
          <g key={g.key} pointerEvents="none">
            {renderShape(g.kind, g.rect, {
              fill: CATALOG[g.kind].colour,
              fillOpacity: 0.22,
              stroke: "var(--cc-proposal)",
              strokeWidth: 2,
              strokeDasharray: "6 3",
              className: "ghost-outline",
            })}
            {g.rect.w * scale > 30 && (
              <text
                className="obj-label"
                x={
                  CATALOG[g.kind].shape === "circle"
                    ? g.rect.x * scale + (g.rect.w * scale) / 2
                    : g.rect.x * scale + 4
                }
                y={
                  CATALOG[g.kind].shape === "circle"
                    ? g.rect.y * scale + (g.rect.h * scale) / 2 + 4
                    : g.rect.y * scale + 13
                }
                textAnchor={
                  CATALOG[g.kind].shape === "circle" ? "middle" : "start"
                }
                fill="var(--cc-proposal)"
              >
                {g.short}
              </text>
            )}
          </g>
        ))}

        {armed && hover && (
          <g pointerEvents="none" opacity={0.55}>
            {renderShape(
              armed,
              { ...hover, w: CATALOG[armed].w, h: CATALOG[armed].h },
              {
                fill: CATALOG[armed].colour,
                fillOpacity: 0.35,
                stroke: "#ffffff",
                strokeWidth: 1.5,
                strokeDasharray: "4 3",
              }
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
