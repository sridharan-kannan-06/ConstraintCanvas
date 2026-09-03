import { specFor } from "./catalog";
import { deriveCandidates, type RuleCandidate } from "./derive";
import { round1, snap } from "./geometry";
import { evaluate, evaluateWorld, newViolations } from "./rules";
import {
  DEFAULT_SCENARIO_ID,
  loadScenario,
  makeObject,
  nextId,
  SCENARIOS,
} from "./scenario";
import type {
  ChangeOp,
  FloorObject,
  LogEntry,
  LogKind,
  ObjectKind,
  Proposal,
  ProposalItem,
  Rule,
  Violation,
  WorldState,
} from "./types";

export type BridgeMode = "native" | "shim" | "none";

export interface CaptureState {
  /** Whether the human rejected a change or the agent suggested a rule outright. */
  origin: "rejection" | "instruction";
  /** Wording recorded in the rulebook as the reason this rule exists. */
  trigger: string;
  proposalId?: string;
  item?: ProposalItem;
  candidates: RuleCandidate[];
  selectedCandidateId: string;
  statement: string;
  meters: number | null;
}

export interface HistoryEntry {
  /** Shown on the undo control so the human knows what will come back. */
  label: string;
  world: WorldState;
  pending: Proposal | null;
}

export interface AppState {
  world: WorldState;
  pending: Proposal | null;
  log: LogEntry[];
  selectedId: string | null;
  capture: CaptureState | null;
  bridge: { mode: BridgeMode; tools: string[] };
  /** Ids that were touched by the most recent accepted proposal, for a brief highlight. */
  flash: string[];
  history: HistoryEntry[];
  scenarioId: string;
}

export type ProposalOutcome =
  | { accepted: true; proposalId: string; summary: string; itemCount: number }
  | {
      accepted: false;
      reason: "LOCKED_OBJECT" | "RULE_VIOLATION" | "PROPOSAL_PENDING" | "BAD_INPUT";
      message: string;
      rule?: { id: string; statement: string };
      offendingItem?: { description: string; change: ChangeOp };
      margin?: string;
    };

function initialState(scenarioId = DEFAULT_SCENARIO_ID): AppState {
  return {
    world: loadScenario(scenarioId),
    pending: null,
    log: [],
    selectedId: null,
    capture: null,
    bridge: { mode: "none", tools: [] },
    flash: [],
    history: [],
    scenarioId,
  };
}

/** How many steps back the human can go. Deep enough to cover a demo run. */
const HISTORY_LIMIT = 40;

let state: AppState = initialState();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(mutator: (draft: AppState) => AppState | void) {
  const next = mutator(state);
  if (next) state = next;
  else state = { ...state };
  emit();
}

export const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): AppState {
    return state;
  },
};

// Reading the world outside React, which the tool implementations rely on.
export function getWorld(): WorldState {
  return state.world;
}
export function getState(): AppState {
  return state;
}

export function log(
  kind: LogKind,
  actor: LogEntry["actor"],
  message: string,
  extra: { tool?: string; detail?: string } = {}
) {
  const entry: LogEntry = {
    id: nextId("log"),
    at: Date.now(),
    kind,
    actor,
    message,
    tool: extra.tool,
    detail: extra.detail,
  };
  set((s) => ({ ...s, log: [entry, ...s.log].slice(0, 300) }));
}

export function setBridge(mode: BridgeMode, tools: string[]) {
  set((s) => ({ ...s, bridge: { mode, tools } }));
}

/* Undo. */

/**
 * Records the state a mutation is about to replace.
 *
 * The floor and the pending proposal are captured together, so undoing an
 * approval brings back the proposal it resolved rather than leaving a change
 * with no explanation behind it. Rules are inside the world, so revoking or
 * ratifying one is undoable too.
 *
 * Call this immediately before mutating, never after.
 */
export function pushHistory(label: string) {
  const entry: HistoryEntry = {
    label,
    world: state.world,
    pending: state.pending,
  };
  set((s) => ({ ...s, history: [...s.history, entry].slice(-HISTORY_LIMIT) }));
}

export function undo() {
  const entry = state.history[state.history.length - 1];
  if (!entry) return;
  set((s) => ({
    ...s,
    world: entry.world,
    pending: entry.pending,
    history: s.history.slice(0, -1),
    capture: null,
    selectedId: null,
    flash: [],
  }));
  log("human_edit", "human", `Undid: ${entry.label}`);
}

export function undoLabel(): string | null {
  return state.history[state.history.length - 1]?.label ?? null;
}

/* Human editing of the floor. */

export function selectObject(id: string | null) {
  set((s) => ({ ...s, selectedId: id }));
}

export function addObjectByHuman(kind: ObjectKind, x: number, y: number) {
  const g = state.world.floor.gridM;
  const obj = makeObject(kind, round1(snap(x, g)), round1(snap(y, g)));
  pushHistory(`placing ${obj.label}`);
  set((s) => ({
    ...s,
    world: { ...s.world, objects: [...s.world.objects, obj] },
    selectedId: obj.id,
  }));
  log("human_edit", "human", `Placed ${obj.label}.`);
}

/**
 * Marks the start of a drag. A drag fires a move on every pointer event, so
 * history is recorded once here rather than on each frame, and one undo puts
 * the object back where the drag began.
 */
export function beginMove(id: string) {
  const target = state.world.objects.find((o) => o.id === id);
  if (!target || target.locked) return;
  pushHistory(`moving ${target.label}`);
}

export function moveObjectByHuman(id: string, x: number, y: number) {
  const target = state.world.objects.find((o) => o.id === id);
  if (!target || target.locked) return;
  const g = state.world.floor.gridM;
  set((s) => ({
    ...s,
    world: {
      ...s.world,
      objects: s.world.objects.map((o) =>
        o.id === id
          ? { ...o, x: round1(snap(x, g)), y: round1(snap(y, g)) }
          : o
      ),
    },
  }));
}

export function removeObjectByHuman(id: string) {
  const target = state.world.objects.find((o) => o.id === id);
  if (!target || target.locked) return;
  pushHistory(`removing ${target.label}`);
  set((s) => ({
    ...s,
    world: { ...s.world, objects: s.world.objects.filter((o) => o.id !== id) },
    selectedId: null,
  }));
  log("human_edit", "human", `Removed ${target.label}.`);
}

export function toggleLock(id: string) {
  const target = state.world.objects.find((o) => o.id === id);
  if (!target) return;
  pushHistory(`${target.locked ? "unlocking" : "locking"} ${target.label}`);
  set((s) => ({
    ...s,
    world: {
      ...s.world,
      objects: s.world.objects.map((o) =>
        o.id === id ? { ...o, locked: !o.locked } : o
      ),
    },
  }));
  log(
    "human_edit",
    "human",
    `${target.locked ? "Unlocked" : "Locked"} ${target.label}.`
  );
}

/* Applying a set of changes to a snapshot of the objects. */

export function applyChanges(
  objects: FloorObject[],
  changes: ChangeOp[]
): FloorObject[] {
  let next = [...objects];
  for (const c of changes) {
    if (c.op === "add") {
      const spec = specFor(c.kind);
      next.push({
        id: c.tempId,
        kind: c.kind,
        label: c.label ?? spec.label,
        x: round1(c.x),
        y: round1(c.y),
        w: spec.w,
        h: spec.h,
        locked: false,
        seats: spec.seats,
      });
    } else if (c.op === "move") {
      next = next.map((o) =>
        o.id === c.id ? { ...o, x: round1(c.x), y: round1(c.y) } : o
      );
    } else {
      next = next.filter((o) => o.id !== c.id);
    }
  }
  return next;
}

function changeTargetId(c: ChangeOp): string {
  return c.op === "add" ? c.tempId : c.id;
}

export function describeChange(c: ChangeOp, world: WorldState): string {
  if (c.op === "add") {
    const spec = specFor(c.kind);
    return `Place ${c.label ?? spec.label} at ${round1(c.x)}, ${round1(c.y)}.`;
  }
  const existing = world.objects.find((o) => o.id === changeTargetId(c));
  const name = existing?.label ?? changeTargetId(c);
  if (c.op === "move") {
    return `Move ${name} to ${round1(c.x)}, ${round1(c.y)}.`;
  }
  return `Remove ${name}.`;
}

/* The tool boundary. */

/**
 * Validates a changeset and, if it survives, parks it as a pending preview.
 *
 * Nothing here mutates the floor. That is the whole point of the separation:
 * an agent can only ever reach a preview, and a human decides what lands.
 */
export function submitProposal(
  changes: ChangeOp[],
  summary: string,
  origin: Proposal["origin"]
): ProposalOutcome {
  if (!Array.isArray(changes) || changes.length === 0) {
    return {
      accepted: false,
      reason: "BAD_INPUT",
      message: "A proposal must contain at least one change.",
    };
  }

  if (state.pending) {
    return {
      accepted: false,
      reason: "PROPOSAL_PENDING",
      message: `Proposal ${state.pending.id} is still awaiting a human decision. Resolve it before submitting another.`,
    };
  }

  const world = state.world;

  // Locks are checked first and separately. A locked object is not a rule the
  // human can be talked out of, it is a hard boundary on the tool surface.
  for (const c of changes) {
    if (c.op === "add") continue;
    const target = world.objects.find((o) => o.id === c.id);
    if (!target) {
      return {
        accepted: false,
        reason: "BAD_INPUT",
        message: `No object with id ${c.id} exists on the floor.`,
        offendingItem: { description: describeChange(c, world), change: c },
      };
    }
    if (target.locked) {
      return {
        accepted: false,
        reason: "LOCKED_OBJECT",
        message: `${target.label} is locked by the human and cannot be moved or removed. Plan around it.`,
        offendingItem: { description: describeChange(c, world), change: c },
      };
    }
  }

  const before = evaluateWorld(world);
  const afterObjects = applyChanges(world.objects, changes);
  const after = evaluate(afterObjects, world.floor, world.rules);
  const introduced = newViolations(before, after);

  if (introduced.length > 0) {
    const v = introduced[0];
    const rule = world.rules.find((r) => r.id === v.ruleId);
    const culprit = changes.find((c) => v.objectIds.includes(changeTargetId(c)));
    return {
      accepted: false,
      reason: "RULE_VIOLATION",
      message: `Refused. The plan breaks the rule: ${v.ruleStatement}`,
      rule: rule
        ? { id: rule.id, statement: rule.statement }
        : { id: v.ruleId, statement: v.ruleStatement },
      offendingItem: culprit
        ? { description: describeChange(culprit, world), change: culprit }
        : undefined,
      margin: v.margin,
    };
  }

  const proposal: Proposal = {
    id: nextId("prop"),
    summary,
    origin,
    createdAt: Date.now(),
    status: "pending",
    items: changes.map((c) => ({
      id: nextId("item"),
      change: c,
      description: describeChange(c, world),
      status: "pending",
    })),
  };

  set((s) => ({ ...s, pending: proposal }));
  return {
    accepted: true,
    proposalId: proposal.id,
    summary,
    itemCount: proposal.items.length,
  };
}

/** Objects as they would look with every still pending item applied. */
export function previewObjects(): FloorObject[] {
  if (!state.pending) return state.world.objects;
  const live = state.pending.items
    .filter((i) => i.status === "pending")
    .map((i) => i.change);
  return applyChanges(state.world.objects, live);
}

function finaliseIfDone(draft: AppState): AppState {
  if (!draft.pending) return draft;
  const anyPending = draft.pending.items.some((i) => i.status === "pending");
  if (anyPending) return draft;
  return { ...draft, pending: null };
}

export function acceptItem(itemId: string) {
  const pending = state.pending;
  if (!pending) return;
  const item = pending.items.find((i) => i.id === itemId);
  if (!item || item.status !== "pending") return;

  pushHistory(`accepting ${item.description}`);
  set((s) => {
    const objects = applyChanges(s.world.objects, [item.change]);
    const nextPending: Proposal = {
      ...pending,
      items: pending.items.map((i) =>
        i.id === itemId ? { ...i, status: "accepted" as const } : i
      ),
    };
    return finaliseIfDone({
      ...s,
      world: { ...s.world, objects },
      pending: nextPending,
      flash: [changeTargetId(item.change)],
    });
  });
  log("approval", "human", `Accepted: ${item.description}`);
}

export function acceptAll() {
  const pending = state.pending;
  if (!pending) return;
  const live = pending.items.filter((i) => i.status === "pending");
  if (live.length === 0) return;

  pushHistory(
    `accepting ${live.length} change${live.length === 1 ? "" : "s"}`
  );
  set((s) => {
    const objects = applyChanges(
      s.world.objects,
      live.map((i) => i.change)
    );
    return {
      ...s,
      world: { ...s.world, objects },
      pending: null,
      flash: live.map((i) => changeTargetId(i.change)),
    };
  });
  log(
    "approval",
    "human",
    `Accepted all ${live.length} change${live.length === 1 ? "" : "s"} in ${pending.id}.`,
    { detail: pending.summary }
  );
}

/**
 * Rejecting an item does not simply discard it. It opens the rule capture flow,
 * which is the mechanism that turns a one off correction into a standing
 * constraint the tool boundary will enforce from then on.
 */
export function rejectItem(itemId: string) {
  const pending = state.pending;
  if (!pending) return;
  const item = pending.items.find((i) => i.id === itemId);
  if (!item || item.status !== "pending") return;

  pushHistory(`rejecting ${item.description}`);
  const candidates = deriveCandidates(item, state.world);
  const first = candidates[0];

  set((s) => {
    const nextPending: Proposal = {
      ...pending,
      items: pending.items.map((i) =>
        i.id === itemId ? { ...i, status: "rejected" as const } : i
      ),
    };
    return finaliseIfDone({
      ...s,
      pending: nextPending,
      capture: first
        ? {
            origin: "rejection" as const,
            trigger: `Rejected: ${item.description}`,
            proposalId: pending.id,
            item,
            candidates,
            selectedCandidateId: first.id,
            statement: first.statement,
            meters: first.knob?.value ?? null,
          }
        : null,
    });
  });
  log("rejection", "human", `Rejected: ${item.description}`);
}

export function rejectAll() {
  const pending = state.pending;
  if (!pending) return;
  const live = pending.items.filter((i) => i.status === "pending");
  if (live.length === 0) return;
  rejectItem(live[0].id);
  set((s) => {
    if (!s.pending) return s;
    return finaliseIfDone({
      ...s,
      pending: {
        ...s.pending,
        items: s.pending.items.map((i) =>
          i.status === "pending" ? { ...i, status: "rejected" as const } : i
        ),
      },
    });
  });
}

/* Rule capture. */

function applyKnob(candidate: RuleCandidate, meters: number | null): RuleCandidate {
  if (meters === null || !candidate.knob) return candidate;
  const statement = candidate.statement.replace(
    /\d+(?:\.\d+)?\s*m\b/,
    `${meters.toFixed(1)} m`
  );
  return {
    ...candidate,
    statement,
    params: { ...candidate.params, meters },
  };
}

export function selectCandidate(id: string) {
  set((s) => {
    if (!s.capture) return s;
    const candidate = s.capture.candidates.find((c) => c.id === id);
    if (!candidate) return s;
    return {
      ...s,
      capture: {
        ...s.capture,
        selectedCandidateId: id,
        statement: candidate.statement,
        meters: candidate.knob?.value ?? null,
      },
    };
  });
}

export function updateCapture(patch: Partial<Pick<CaptureState, "statement" | "meters">>) {
  set((s) => {
    if (!s.capture) return s;
    const next = { ...s.capture, ...patch };
    if (patch.meters !== undefined && patch.meters !== null) {
      const candidate = s.capture.candidates.find(
        (c) => c.id === s.capture!.selectedCandidateId
      );
      if (candidate?.knob) {
        next.statement = applyKnob(candidate, patch.meters).statement;
      }
    }
    return { ...s, capture: next };
  });
}

export function confirmCapture() {
  const capture = state.capture;
  if (!capture) return;
  const candidate = capture.candidates.find(
    (c) => c.id === capture.selectedCandidateId
  );
  if (!candidate) return;

  pushHistory("adding a rule to the rulebook");
  const resolved = applyKnob(candidate, capture.meters);
  const rule: Rule = {
    id: nextId("rule"),
    statement: capture.statement.trim() || resolved.statement,
    kind: resolved.kind,
    params: resolved.params,
    source: capture.origin === "rejection" ? "rejection" : "agent_proposed",
    enabled: true,
    provenance: {
      trigger: capture.trigger,
      proposalId: capture.proposalId,
      itemId: capture.item?.id,
      createdAt: Date.now(),
    },
  };

  set((s) => ({
    ...s,
    world: { ...s.world, rules: [...s.world.rules, rule] },
    capture: null,
  }));
  log("rule_added", "human", `Rule added: ${rule.statement}`, {
    detail: rule.provenance.trigger,
  });
}

/**
 * Opens the same confirmation flow a rejection opens, but from an instruction
 * the agent parsed. The agent can draft a rule. It cannot enact one.
 */
export function openRuleProposal(
  instruction: string,
  candidate: RuleCandidate
): { opened: boolean; message: string } {
  if (state.capture) {
    return {
      opened: false,
      message:
        "A rule is already awaiting confirmation. The human has to resolve that one first.",
    };
  }
  set((s) => ({
    ...s,
    capture: {
      origin: "instruction" as const,
      trigger: `Agent read the instruction: "${instruction.trim()}"`,
      candidates: [candidate],
      selectedCandidateId: candidate.id,
      statement: candidate.statement,
      meters: candidate.knob?.value ?? null,
    },
  }));
  return {
    opened: true,
    message:
      "Drafted and sent to the human for confirmation. It is not enforced until they ratify it.",
  };
}

export function dismissCapture() {
  set((s) => ({ ...s, capture: null }));
  log("rejection", "human", "Declined to turn the rejection into a rule.");
}

/* Rulebook management. Only the human reaches these. */

export function addRule(rule: Rule) {
  set((s) => ({ ...s, world: { ...s.world, rules: [...s.world.rules, rule] } }));
  log("rule_added", "human", `Rule added: ${rule.statement}`, {
    detail: rule.provenance.trigger,
  });
}

export function toggleRule(id: string) {
  const rule = state.world.rules.find((r) => r.id === id);
  if (!rule) return;
  pushHistory(`${rule.enabled ? "waiving" : "reinstating"} a rule`);
  set((s) => ({
    ...s,
    world: {
      ...s.world,
      rules: s.world.rules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    },
  }));
  log(
    "rule_toggled",
    "human",
    `${rule.enabled ? "Waived" : "Reinstated"} rule: ${rule.statement}`
  );
}

export function deleteRule(id: string) {
  const rule = state.world.rules.find((r) => r.id === id);
  if (!rule || rule.source === "builtin") return;
  pushHistory("revoking a rule");
  set((s) => ({
    ...s,
    world: { ...s.world, rules: s.world.rules.filter((r) => r.id !== id) },
  }));
  log("rule_toggled", "human", `Revoked rule: ${rule.statement}`);
}

export function clearFlash() {
  if (state.flash.length === 0) return;
  set((s) => ({ ...s, flash: [] }));
}

export function currentViolations(): Violation[] {
  return evaluateWorld(state.world);
}

/**
 * Loads a scenario from scratch. History is not preserved across a load,
 * because undoing into a different floor would be meaningless.
 */
export function loadScenarioById(id: string) {
  const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  // The tool surface belongs to the page, not to the floor, so a scenario
  // load must not blank out what the bridge already registered.
  const bridge = state.bridge;
  state = { ...initialState(scenario.id), bridge };
  emit();
  log("human_edit", "human", `Loaded the ${scenario.name} scenario.`);
}

export function resetAll() {
  loadScenarioById(state.scenarioId);
}
