import { computeMetrics } from "./metrics";
import { evaluateWorld } from "./rules";
import type { AppState } from "./store";

/**
 * Plan export. The geometry is the smaller half of what is worth keeping. The
 * rulebook, with each rule carrying the rejection that produced it, is a
 * written record of the judgment applied during the session.
 */
export function buildPlanExport(state: AppState) {
  const { world } = state;
  const metrics = computeMetrics(world);
  const violations = evaluateWorld(world);

  return {
    format: "constraintcanvas.plan",
    version: 1,
    exported_at: new Date().toISOString(),
    note: "The constraints in this file are ConstraintCanvas's own simplified planning model. They are not a building code and carry no regulatory meaning.",
    floor: {
      name: world.floor.name,
      width_m: world.floor.widthM,
      height_m: world.floor.heightM,
      grid_m: world.floor.gridM,
      capacity: world.floor.capacity,
    },
    metrics: {
      seats: metrics.seats,
      capacity: metrics.capacity,
      floor_area_m2: metrics.floorAreaM2,
      used_area_m2: metrics.usedAreaM2,
      utilisation_pct: metrics.utilisationPct,
      circulation_pct: metrics.circulationPct,
      furthest_seat_to_exit_m: metrics.furthestSeatToExitM,
      violation_count: metrics.violationCount,
    },
    objects: world.objects.map((o) => ({
      id: o.id,
      kind: o.kind,
      label: o.label,
      x: o.x,
      y: o.y,
      width_m: o.w,
      height_m: o.h,
      seats: o.seats,
      locked: o.locked,
    })),
    rules: world.rules.map((r) => ({
      id: r.id,
      statement: r.statement,
      kind: r.kind,
      params: r.params,
      source: r.source,
      enabled: r.enabled,
      origin: r.provenance.trigger,
      created_at:
        r.provenance.createdAt > 0
          ? new Date(r.provenance.createdAt).toISOString()
          : null,
      from_proposal: r.provenance.proposalId ?? null,
    })),
    violations: violations.map((v) => ({
      rule_id: v.ruleId,
      rule: v.ruleStatement,
      object_ids: v.objectIds,
      margin: v.margin,
    })),
    activity: state.log
      .slice()
      .reverse()
      .map((e) => ({
        at: new Date(e.at).toISOString(),
        kind: e.kind,
        actor: e.actor,
        tool: e.tool ?? null,
        message: e.message,
      })),
  };
}

function save(filename: string, mime: string, contents: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function exportPlanJson(state: AppState) {
  save(
    `${slug(state.world.floor.name)}-plan.json`,
    "application/json",
    JSON.stringify(buildPlanExport(state), null, 2)
  );
}

/**
 * Serialises the live canvas to a standalone SVG. Custom properties mean
 * nothing once the markup leaves the page, so every var() reference is
 * resolved against the computed root style and text styles are inlined.
 */
export function exportDrawingSvg(state: AppState) {
  const source = document.getElementById("floor-canvas");
  if (!(source instanceof SVGSVGElement)) return;

  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = [
    ".obj-label{font:600 10px 'IBM Plex Sans',system-ui,sans-serif;fill:#ffffff}",
    ".obj-sub{font:9px 'IBM Plex Mono',monospace;fill:rgba(255,255,255,0.7)}",
  ].join("");
  clone.insertBefore(style, clone.firstChild);

  const computed = getComputedStyle(document.documentElement);
  const markup = new XMLSerializer()
    .serializeToString(clone)
    .replace(/var\((--[a-z0-9-]+)\)/gi, (whole, name: string) => {
      const value = computed.getPropertyValue(name).trim();
      return value || whole;
    });

  save(
    `${slug(state.world.floor.name)}-drawing.svg`,
    "image/svg+xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`
  );
}
