import { CATALOG, KIND_ORDER, specFor } from "@/lib/catalog";
import { deriveFromInstruction } from "@/lib/derive";
import { rectGap, rectOf, round1, snap } from "@/lib/geometry";
import { computeMetrics } from "@/lib/metrics";
import { checkPlacement, optimise, type Objective } from "@/lib/optimise";
import { probeObject } from "@/lib/rules";
import {
  currentViolations,
  describeChange,
  getState,
  getWorld,
  openRuleProposal,
  submitProposal,
} from "@/lib/store";
import type { ChangeOp, ObjectKind } from "@/lib/types";

/**
 * A tool as ConstraintCanvas defines it, before it reaches the browser.
 *
 * Keeping our own descriptor rather than registering inline gives us one place
 * to log every call, and lets the in page agent and the browser agent run
 * through identical code.
 */
export interface CanvasTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  /** Grouping used by the tool inspector panel. */
  group: "inspection" | "proposal" | "explanation" | "authoring";
  execute: (input: Record<string, unknown>) => unknown;
}

function ok(payload: unknown) {
  return payload;
}

function refuse(message: string, extra: Record<string, unknown> = {}) {
  return { refused: true, message, ...extra };
}

const KIND_ENUM = KIND_ORDER;

function asKind(value: unknown): ObjectKind | null {
  return typeof value === "string" && (KIND_ORDER as string[]).includes(value)
    ? (value as ObjectKind)
    : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/* Inspection tools. Free to call, no side effects. */

const getFloorPlan: CanvasTool = {
  name: "get_floor_plan",
  title: "Read the floor plan",
  group: "inspection",
  readOnly: true,
  description:
    "Return the complete current floor plan: room dimensions, grid size, capacity, and every object with its id, kind, position in metres, footprint, seat count and lock status. Call this before proposing anything.",
  inputSchema: {
    type: "object",
    properties: {
      include_catalog: {
        type: "boolean",
        description:
          "Also return the catalogue of object kinds that can be placed, with their footprints and seat counts.",
      },
    },
  },
  execute: (input) => {
    const world = getWorld();
    const payload: Record<string, unknown> = {
      floor: {
        name: world.floor.name,
        width_m: world.floor.widthM,
        height_m: world.floor.heightM,
        grid_m: world.floor.gridM,
        capacity: world.floor.capacity,
        origin: "Coordinates are metres from the north west corner.",
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
      locked_object_ids: world.objects.filter((o) => o.locked).map((o) => o.id),
    };
    if (input.include_catalog) {
      payload.catalog = KIND_ORDER.map((k) => ({
        kind: k,
        label: CATALOG[k].label,
        width_m: CATALOG[k].w,
        height_m: CATALOG[k].h,
        seats: CATALOG[k].seats,
        description: CATALOG[k].description,
      }));
    }
    return ok(payload);
  },
};

const getRulebook: CanvasTool = {
  name: "get_rulebook",
  title: "Read the rulebook",
  group: "inspection",
  readOnly: true,
  description:
    "Return every constraint currently governing this floor: the built-in planning rules that ship with the app and the rules the human has authored during this session, each with its plain language statement, its origin and whether it is active. Every proposal you make is validated against this list before it can be shown to the human.",
  inputSchema: {
    type: "object",
    properties: {
      include_disabled: {
        type: "boolean",
        description: "Include rules the human has waived. Defaults to false.",
      },
    },
  },
  execute: (input) => {
    const world = getWorld();
    const rules = world.rules.filter(
      (r) => r.enabled || input.include_disabled === true
    );
    return ok({
      note: "These rules are the app's own simplified planning model. They are not a real building code.",
      count: rules.length,
      rules: rules.map((r) => ({
        id: r.id,
        statement: r.statement,
        kind: r.kind,
        params: r.params,
        source: r.source,
        enabled: r.enabled,
        origin: r.provenance.trigger,
      })),
    });
  },
};

const getViolations: CanvasTool = {
  name: "get_violations",
  title: "Read current violations",
  group: "inspection",
  readOnly: true,
  description:
    "Return everything that is currently broken on the floor and by how much. Use this to find work worth doing, and to confirm a plan actually improved things.",
  inputSchema: { type: "object", properties: {} },
  execute: () => {
    const violations = currentViolations();
    return ok({
      count: violations.length,
      violations: violations.map((v) => ({
        rule_id: v.ruleId,
        rule: v.ruleStatement,
        object_ids: v.objectIds,
        margin: v.margin,
        severity: v.severity,
      })),
    });
  },
};

const getMetrics: CanvasTool = {
  name: "get_metrics",
  title: "Read utilisation figures",
  group: "inspection",
  readOnly: true,
  description:
    "Return seat count against capacity, floor area used, circulation share, the distance from the furthest seat to the nearest exit, and the live violation count.",
  inputSchema: { type: "object", properties: {} },
  execute: () => {
    const m = computeMetrics(getWorld());
    return ok({
      seats: m.seats,
      capacity: m.capacity,
      seats_remaining: m.capacity - m.seats,
      floor_area_m2: m.floorAreaM2,
      used_area_m2: m.usedAreaM2,
      utilisation_pct: m.utilisationPct,
      circulation_pct: m.circulationPct,
      furthest_seat_to_exit_m: m.furthestSeatToExitM,
      violation_count: m.violationCount,
    });
  },
};

const getPendingProposal: CanvasTool = {
  name: "get_pending_proposal",
  title: "Check what is awaiting approval",
  group: "inspection",
  readOnly: true,
  description:
    "Return the proposal currently waiting on a human decision, if any, with the status of each item. Only one proposal can be pending at a time, so check here if a submission was turned away as blocked.",
  inputSchema: { type: "object", properties: {} },
  execute: () => {
    const pending = getState().pending;
    if (!pending) {
      return ok({ pending: false, message: "Nothing is awaiting approval." });
    }
    return ok({
      pending: true,
      proposal_id: pending.id,
      summary: pending.summary,
      origin: pending.origin,
      items: pending.items.map((i) => ({
        id: i.id,
        description: i.description,
        status: i.status,
      })),
    });
  },
};

/* Proposal tools. The only route to changing the floor, and even then only
   as far as a preview the human still has to approve. */

function parseChanges(raw: unknown): ChangeOp[] | string {
  if (!Array.isArray(raw)) return "changes must be an array.";
  const out: ChangeOp[] = [];
  const world = getWorld();
  const g = world.floor.gridM;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Record<string, unknown>;
    const op = c?.op;
    if (op === "add") {
      const kind = asKind(c.kind);
      const x = num(c.x);
      const y = num(c.y);
      if (!kind) return `changes[${i}]: kind must be one of ${KIND_ENUM.join(", ")}.`;
      if (x === null || y === null)
        return `changes[${i}]: add needs numeric x and y in metres.`;
      out.push({
        op: "add",
        tempId: `new_${i + 1}_${Math.random().toString(36).slice(2, 6)}`,
        kind,
        x: round1(snap(x, g)),
        y: round1(snap(y, g)),
        label: typeof c.label === "string" ? c.label : undefined,
      });
    } else if (op === "move") {
      const x = num(c.x);
      const y = num(c.y);
      if (typeof c.id !== "string")
        return `changes[${i}]: move needs the id of an existing object.`;
      if (x === null || y === null)
        return `changes[${i}]: move needs numeric x and y in metres.`;
      out.push({ op: "move", id: c.id, x: round1(snap(x, g)), y: round1(snap(y, g)) });
    } else if (op === "remove") {
      if (typeof c.id !== "string")
        return `changes[${i}]: remove needs the id of an existing object.`;
      out.push({ op: "remove", id: c.id });
    } else {
      return `changes[${i}]: op must be add, move or remove.`;
    }
  }
  return out;
}

function outcomeToResult(
  outcome: ReturnType<typeof submitProposal>,
  extra: Record<string, unknown> = {}
) {
  if (outcome.accepted) {
    return ok({
      status: "awaiting_human_approval",
      proposal_id: outcome.proposalId,
      summary: outcome.summary,
      item_count: outcome.itemCount,
      message:
        "The plan passed every rule and is now showing on the canvas as a ghosted preview. Nothing has changed on the floor. The human decides item by item.",
      ...extra,
    });
  }
  return refuse(outcome.message, {
    reason: outcome.reason,
    broken_rule: outcome.rule,
    offending_item: outcome.offendingItem?.description,
    margin: outcome.margin,
    next_step:
      outcome.reason === "RULE_VIOLATION"
        ? "Read get_rulebook, adjust the offending placement, and submit again. The rule will not be relaxed for you."
        : outcome.reason === "LOCKED_OBJECT"
          ? "The human locked that object deliberately. Plan around it."
          : outcome.reason === "PROPOSAL_PENDING"
            ? "Call get_pending_proposal and wait for the human to decide."
            : "Fix the input and try again.",
    ...extra,
  });
}

const proposeChanges: CanvasTool = {
  name: "propose_changes",
  title: "Propose changes to the floor",
  group: "proposal",
  readOnly: false,
  description:
    "Submit a set of placements, moves or removals. This never edits the floor directly. The app validates the whole set against locked objects and every active rule. If any item breaks a rule the entire plan is refused and you are told which rule and which item. If it passes, it appears as a ghosted preview for the human to accept or reject item by item.",
  inputSchema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One sentence in plain language describing what this plan does and why, shown to the human above the items.",
      },
      changes: {
        type: "array",
        description: "The changes to apply, evaluated as one atomic plan.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["add", "move", "remove"] },
            kind: {
              type: "string",
              enum: KIND_ENUM,
              description: "Required for add. The type of object to place.",
            },
            id: {
              type: "string",
              description: "Required for move and remove. An existing object id.",
            },
            x: {
              type: "number",
              description:
                "Left edge in metres from the north west corner. Required for add and move.",
            },
            y: {
              type: "number",
              description:
                "Top edge in metres from the north west corner. Required for add and move.",
            },
            label: { type: "string", description: "Optional name for a new object." },
          },
          required: ["op"],
        },
      },
    },
    required: ["summary", "changes"],
  },
  execute: (input) => {
    const parsed = parseChanges(input.changes);
    if (typeof parsed === "string") {
      return refuse(parsed, { reason: "BAD_INPUT" });
    }
    const summary =
      typeof input.summary === "string" && input.summary.trim()
        ? input.summary.trim()
        : `Agent plan with ${parsed.length} change${parsed.length === 1 ? "" : "s"}.`;
    return outcomeToResult(submitProposal(parsed, summary, "agent"));
  },
};

const optimiseLayout: CanvasTool = {
  name: "optimise_layout",
  title: "Optimise the unlocked floor",
  group: "proposal",
  readOnly: false,
  description:
    "Ask the app to lay out the unlocked part of the floor against an objective. Locked objects are never touched and every candidate position is tested against the live rulebook before it is offered. Returns a proposal awaiting human approval, never a direct change.",
  inputSchema: {
    type: "object",
    properties: {
      objective: {
        type: "string",
        enum: ["maximise_seating", "widen_circulation", "improve_sightlines"],
        description: "What to optimise for.",
      },
      target_seats: {
        type: "number",
        description:
          "For maximise_seating, how many extra seats to aim for. Defaults to 40.",
      },
      object_kind: {
        type: "string",
        enum: ["round_table", "rect_table"],
        description:
          "For maximise_seating, which seating type to add. Defaults to round_table.",
      },
    },
    required: ["objective"],
  },
  execute: (input) => {
    const objective = input.objective as Objective;
    if (
      !["maximise_seating", "widen_circulation", "improve_sightlines"].includes(
        String(objective)
      )
    ) {
      return refuse("Unknown objective.", { reason: "BAD_INPUT" });
    }
    const world = getWorld();
    const result = optimise(world, objective, {
      kind: asKind(input.object_kind) ?? undefined,
      targetSeats: num(input.target_seats) ?? undefined,
    });

    if (result.changes.length === 0) {
      return refuse(
        `No change could be found that satisfies the current rulebook. ${result.notes.join(
          " "
        )}`,
        { reason: "NO_VALID_PLAN", objective }
      );
    }

    return outcomeToResult(
      submitProposal(result.changes, result.summary, "optimiser"),
      { notes: result.notes }
    );
  },
};

/* Explanation. */

const explainPlacement: CanvasTool = {
  name: "explain_placement",
  title: "Explain why a placement fails",
  group: "explanation",
  readOnly: true,
  description:
    "Given an object kind and a position, report whether it can go there and, if not, exactly which rules it breaks, which neighbouring objects are involved and by what margin. Use this to answer a human asking why something will not fit, and to debug your own refused plans.",
  inputSchema: {
    type: "object",
    properties: {
      object_kind: { type: "string", enum: KIND_ENUM },
      x: { type: "number", description: "Left edge in metres." },
      y: { type: "number", description: "Top edge in metres." },
    },
    required: ["object_kind", "x", "y"],
  },
  execute: (input) => {
    const kind = asKind(input.object_kind);
    const x = num(input.x);
    const y = num(input.y);
    if (!kind || x === null || y === null) {
      return refuse("Needs object_kind, x and y.", { reason: "BAD_INPUT" });
    }

    const world = getWorld();
    const probe = probeObject(kind, snap(x, world.floor.gridM), snap(y, world.floor.gridM));
    const check = checkPlacement(probe, world.objects, world.floor, world.rules);
    const spec = specFor(kind);

    const neighbours = world.objects
      .map((o) => ({ o, gap: rectGap(rectOf(probe), rectOf(o)) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 3)
      .map((n) => ({
        id: n.o.id,
        label: n.o.label,
        locked: n.o.locked,
        gap_m: round1(n.gap),
      }));

    if (check.ok) {
      return ok({
        can_place: true,
        object_kind: kind,
        footprint_m: { width: spec.w, height: spec.h },
        position: { x: probe.x, y: probe.y },
        nearest_objects: neighbours,
        message: `A ${spec.label.toLowerCase()} fits at ${probe.x}, ${probe.y} without breaking any active rule.`,
      });
    }

    return ok({
      can_place: false,
      object_kind: kind,
      footprint_m: { width: spec.w, height: spec.h },
      position: { x: probe.x, y: probe.y },
      nearest_objects: neighbours,
      blocked_by: check.violations.map((v) => ({
        rule_id: v.ruleId,
        rule: v.ruleStatement,
        involves: v.objectIds.filter((id) => id !== probe.id),
        margin: v.margin,
      })),
      message: `A ${spec.label.toLowerCase()} cannot go at ${probe.x}, ${probe.y}. ${
        check.violations[0].margin
      }.`,
    });
  },
};

/* Constraint authoring. The agent drafts, the human ratifies. */

const proposeRule: CanvasTool = {
  name: "propose_rule",
  title: "Draft a rule for the human to confirm",
  group: "authoring",
  readOnly: false,
  description:
    "Turn a plain language planning instruction from the human into a structured rule and send it to them for one tap confirmation. You cannot add, edit or delete rules yourself. This only drafts one. Nothing is enforced until the human ratifies it in the rulebook panel.",
  inputSchema: {
    type: "object",
    properties: {
      instruction: {
        type: "string",
        description:
          "The instruction in the human's own words, for example: never put standing tables near the entrance.",
      },
    },
    required: ["instruction"],
  },
  execute: (input) => {
    const instruction = typeof input.instruction === "string" ? input.instruction : "";
    if (!instruction.trim()) {
      return refuse("Needs a non-empty instruction.", { reason: "BAD_INPUT" });
    }
    const candidate = deriveFromInstruction(instruction, getWorld());
    const result = openRuleProposal(instruction, candidate);
    if (!result.opened) {
      return refuse(result.message, { reason: "CAPTURE_PENDING" });
    }
    return ok({
      status: "awaiting_human_confirmation",
      drafted_rule: {
        statement: candidate.statement,
        kind: candidate.kind,
        params: candidate.params,
      },
      reading: candidate.rationale,
      message: result.message,
    });
  },
};

export const TOOLS: CanvasTool[] = [
  getFloorPlan,
  getRulebook,
  getViolations,
  getMetrics,
  getPendingProposal,
  proposeChanges,
  optimiseLayout,
  explainPlacement,
  proposeRule,
];

export function toolByName(name: string): CanvasTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Short label used in the activity log for a call, kept readable at a glance. */
export function summariseCall(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "propose_changes": {
      const n = Array.isArray(input.changes) ? input.changes.length : 0;
      return `propose_changes with ${n} change${n === 1 ? "" : "s"}`;
    }
    case "optimise_layout":
      return `optimise_layout for ${String(input.objective ?? "?")}`;
    case "explain_placement":
      return `explain_placement ${String(input.object_kind ?? "?")} at ${String(
        input.x
      )}, ${String(input.y)}`;
    case "propose_rule":
      return `propose_rule: ${String(input.instruction ?? "").slice(0, 60)}`;
    default:
      return name;
  }
}

export { describeChange };
