// Core domain types for ConstraintCanvas.
// All spatial values are metres. The canvas converts to pixels at render time.

export type ObjectKind =
  | "stage"
  | "round_table"
  | "rect_table"
  | "booth"
  | "bar"
  | "exit"
  | "walkway";

export interface FloorObject {
  id: string;
  kind: ObjectKind;
  label: string;
  /** Left edge of the axis aligned bounding box, in metres from the floor origin. */
  x: number;
  /** Top edge of the axis aligned bounding box, in metres from the floor origin. */
  y: number;
  w: number;
  h: number;
  locked: boolean;
  seats: number;
}

export interface Floor {
  name: string;
  widthM: number;
  heightM: number;
  gridM: number;
  /** Maximum occupants the room is rated for. */
  capacity: number;
}

export type RuleKind =
  | "within_bounds"
  | "no_overlap"
  | "min_clearance"
  | "exit_clearance"
  | "egress_distance"
  | "egress_path"
  | "circulation"
  | "capacity"
  | "keep_out_zone"
  | "keep_clear_of"
  | "keep_near";

export type RuleSource = "builtin" | "rejection" | "human" | "agent_proposed";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RuleParams {
  /** Distance threshold in metres, used by clearance and egress rules. */
  meters?: number;
  /** Object kinds the rule applies to. Empty or absent means every kind. */
  kinds?: ObjectKind[];
  /** Object kinds the subject must stay away from, used by keep_clear_of. */
  fromKinds?: ObjectKind[];
  /** Specific object the rule is anchored to. */
  anchorId?: string;
  /** Region the rule covers, used by keep_out_zone. */
  zone?: Rect;
  /** Human readable name for the zone, used in statements and explanations. */
  zoneName?: string;
  /** Occupancy ceiling, used by the capacity rule. */
  limit?: number;
  /** Minimum share of the floor that must stay clear, 0 to 1. */
  ratio?: number;
}

export interface RuleProvenance {
  /** Short account of what caused this rule to exist. */
  trigger: string;
  proposalId?: string;
  itemId?: string;
  createdAt: number;
}

export interface Rule {
  id: string;
  /** Plain language statement shown in the rulebook and returned to agents. */
  statement: string;
  kind: RuleKind;
  params: RuleParams;
  source: RuleSource;
  enabled: boolean;
  provenance: RuleProvenance;
}

export interface Violation {
  ruleId: string;
  ruleStatement: string;
  objectIds: string[];
  /** How far the current state is from satisfying the rule. */
  margin: string;
  severity: "error" | "warning";
}

export type ChangeOp =
  | {
      op: "add";
      tempId: string;
      kind: ObjectKind;
      x: number;
      y: number;
      label?: string;
    }
  | { op: "move"; id: string; x: number; y: number }
  | { op: "remove"; id: string };

export type ItemStatus = "pending" | "accepted" | "rejected";

export interface ProposalItem {
  id: string;
  change: ChangeOp;
  /** One line of plain language describing the change to the human. */
  description: string;
  status: ItemStatus;
}

export interface Proposal {
  id: string;
  summary: string;
  origin: "agent" | "optimiser" | "human";
  createdAt: number;
  items: ProposalItem[];
  status: "pending" | "resolved";
}

export type LogKind =
  | "tool_call"
  | "tool_refusal"
  | "proposal"
  | "approval"
  | "rejection"
  | "rule_added"
  | "rule_toggled"
  | "human_edit";

export interface LogEntry {
  id: string;
  at: number;
  kind: LogKind;
  /** Tool name when the entry came from the WebMCP boundary. */
  tool?: string;
  actor: "agent" | "human" | "app";
  message: string;
  detail?: string;
}

export interface Metrics {
  seats: number;
  capacity: number;
  floorAreaM2: number;
  usedAreaM2: number;
  utilisationPct: number;
  circulationPct: number;
  furthestSeatToExitM: number | null;
  violationCount: number;
}

export interface WorldState {
  floor: Floor;
  objects: FloorObject[];
  rules: Rule[];
}
