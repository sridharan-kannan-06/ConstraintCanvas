import { CATALOG, KIND_ORDER, specFor } from "./catalog";
import { rectGap, rectOf, regionName, regionRect } from "./geometry";
import { probeObject } from "./rules";
import type {
  FloorObject,
  ObjectKind,
  ProposalItem,
  RuleKind,
  RuleParams,
  WorldState,
} from "./types";

/**
 * A rule the app is offering to adopt. Nothing enters the rulebook until the
 * human confirms a candidate, so the agent can suggest but never legislate.
 */
export interface RuleCandidate {
  id: string;
  statement: string;
  kind: RuleKind;
  params: RuleParams;
  /** Why the app thinks this is the rule behind the rejection. */
  rationale: string;
  /** The one number the human is most likely to want to adjust. */
  knob?: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
  };
}

const SEATING_KINDS: ObjectKind[] = ["round_table", "rect_table"];

function roundUpHalf(n: number): number {
  return Math.max(0.5, Math.ceil(n * 2) / 2);
}

/** Resolves the object an item is about, hypothetical or existing. */
function subjectOf(
  item: ProposalItem,
  world: WorldState
): FloorObject | null {
  const c = item.change;
  if (c.op === "add") return probeObject(c.kind, c.x, c.y, c.tempId);
  const existing = world.objects.find((o) => o.id === c.id);
  if (!existing) return null;
  if (c.op === "move") return { ...existing, x: c.x, y: c.y };
  return existing;
}

/**
 * Turns a rejected proposal item into ranked candidate rules.
 *
 * The ranking is deliberately opinionated. A rejection near an exit almost
 * always means the exit, not the coordinates, so that candidate leads. A
 * rejection near a locked object usually means the locked object. Everything
 * else falls back to the region of the floor the human was pointing at.
 */
export function deriveCandidates(
  item: ProposalItem,
  world: WorldState
): RuleCandidate[] {
  const subject = subjectOf(item, world);
  if (!subject) return [];

  const spec = specFor(subject.kind);
  const noun = spec.label.toLowerCase();
  const plural = `${noun}s`;
  const out: RuleCandidate[] = [];
  const sr = rectOf(subject);

  const exits = world.objects.filter(
    (o) => o.kind === "exit" && o.id !== subject.id
  );
  if (exits.length > 0) {
    const nearest = exits.reduce((best, e) =>
      rectGap(sr, rectOf(e)) < rectGap(sr, rectOf(best)) ? e : best
    );
    const gap = rectGap(sr, rectOf(nearest));
    if (gap < 6) {
      // A derived exit rule that lands below the built-in 2.0 m radius would be
      // a rule that changes nothing, so the floor is set above it.
      const meters = Math.max(2.5, roundUpHalf(gap + 0.5));
      out.push({
        id: "cand_exit",
        statement: `No ${noun} within ${meters.toFixed(1)} m of any exit.`,
        kind: "keep_clear_of",
        params: {
          meters,
          kinds: [subject.kind],
          fromKinds: ["exit"],
        },
        rationale: `The rejected ${noun} was ${gap.toFixed(
          1
        )} m from ${nearest.label}.`,
        knob: { label: "Clearance", value: meters, min: 0.5, max: 12, step: 0.5 },
      });
    }
  }

  const locked = world.objects.filter(
    (o) => o.locked && o.kind !== "exit" && o.id !== subject.id
  );
  if (locked.length > 0) {
    const nearest = locked.reduce((best, o) =>
      rectGap(sr, rectOf(o)) < rectGap(sr, rectOf(best)) ? o : best
    );
    const gap = rectGap(sr, rectOf(nearest));
    if (gap < 8) {
      // Enough headroom that the new rule visibly bites rather than restating
      // the 0.9 m clearance the app already enforces.
      const meters = Math.max(1.5, roundUpHalf(gap + 1));
      out.push({
        id: "cand_anchor",
        statement: `Keep ${plural} at least ${meters.toFixed(1)} m from ${
          nearest.label
        }.`,
        kind: "keep_clear_of",
        params: { meters, kinds: [subject.kind], anchorId: nearest.id },
        rationale: `${nearest.label} is locked and was ${gap.toFixed(
          1
        )} m away from the rejected placement.`,
        knob: { label: "Clearance", value: meters, min: 0.5, max: 15, step: 0.5 },
      });
    }
  }

  const region = regionName(
    sr.x + sr.w / 2,
    sr.y + sr.h / 2,
    world.floor.widthM,
    world.floor.heightM
  );
  const zone = regionRect(region, world.floor.widthM, world.floor.heightM);
  out.push({
    id: "cand_zone",
    statement: `No ${noun} in the ${region} area of the floor.`,
    kind: "keep_out_zone",
    params: { zone, zoneName: region, kinds: [subject.kind] },
    rationale: `The rejected placement fell in the ${region} third of the room.`,
  });

  if (SEATING_KINDS.includes(subject.kind)) {
    out.push({
      id: "cand_zone_broad",
      statement: `No seating of any kind in the ${region} area of the floor.`,
      kind: "keep_out_zone",
      params: { zone, zoneName: region, kinds: SEATING_KINDS },
      rationale: `A broader reading of the same rejection, covering all seating rather than just ${plural}.`,
    });
  }

  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
};

function findDistance(text: string): number | null {
  const numeric = text.match(/(\d+(?:\.\d+)?)\s*(?:m\b|metre|meter)/i);
  if (numeric) return parseFloat(numeric[1]);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b\\s*(?:m\\b|metre|meter)`, "i").test(text)) {
      return value;
    }
  }
  const bare = text.match(/(\d+(?:\.\d+)?)\s*(?:away|clear|of)/i);
  if (bare) return parseFloat(bare[1]);
  return null;
}

/** Aliases a planner might type, mapped to the kinds this app understands. */
const KIND_ALIASES: Array<[RegExp, ObjectKind]> = [
  [/\bround\s*table|\bbanquet|\bround\b/i, "round_table"],
  [/\bstanding\s*table|\brect(angular)?\s*table|\btrestle|\blong\s*table/i, "rect_table"],
  [/\bbooth|\bexhibitor|\bsponsor|\bstand\b/i, "booth"],
  [/\bbar\b|\bdrinks/i, "bar"],
  [/\bstage|\bplatform|\bband\b|\bdance\s*floor/i, "stage"],
  [/\bexit|\bdoor|\bentrance|\begress/i, "exit"],
  [/\bwalkway|\baisle|\bcorridor|\bcirculation/i, "walkway"],
  [/\btable/i, "round_table"],
  [/\bseat|\bseating|\bguest/i, "round_table"],
];

function findKinds(text: string, skip?: ObjectKind): ObjectKind[] {
  const hits: ObjectKind[] = [];
  for (const [re, kind] of KIND_ALIASES) {
    if (kind === skip) continue;
    if (re.test(text) && !hits.includes(kind)) hits.push(kind);
  }
  return hits;
}

const REGION_WORDS = [
  "north-west",
  "north-east",
  "south-west",
  "south-east",
  "north",
  "south",
  "east",
  "west",
  "centre",
  "center",
];

/**
 * Best effort conversion of a plain language instruction into a structured
 * candidate. Anything this cannot parse still returns a candidate the human
 * can edit, because an unparsed instruction should not silently vanish.
 */
export function deriveFromInstruction(
  text: string,
  world: WorldState
): RuleCandidate {
  const near = /\bnear|\bwithin|\bnext to|\bbeside|\bclose to|\bby the\b/i.test(
    text
  );
  const wantsAdjacency =
    /\bkeep\s+.*\b(near|next to|beside|close|adjacent)/i.test(text) &&
    !/\bnever|\bnot\b|\bno\b|\bavoid|\baway/i.test(text);

  const regionHit = REGION_WORDS.find((r) =>
    new RegExp(`\\b${r}\\b`, "i").test(text)
  );

  const kinds = findKinds(text);
  const subject = kinds[0];
  const target = kinds.find((k) => k !== subject);
  const distance = findDistance(text);

  if (subject && target) {
    const meters = distance ?? 2;
    const subjectNoun = CATALOG[subject].label.toLowerCase();
    const targetNoun = CATALOG[target].label.toLowerCase();
    if (wantsAdjacency) {
      const anchor = world.objects.find((o) => o.kind === target);
      if (anchor) {
        return {
          id: "cand_nl",
          statement: `Keep ${subjectNoun}s within ${meters.toFixed(
            1
          )} m of ${anchor.label}.`,
          kind: "keep_near",
          params: { meters, kinds: [subject], anchorId: anchor.id },
          rationale: `Read from the instruction: "${text.trim()}"`,
          knob: { label: "Distance", value: meters, min: 1, max: 30, step: 0.5 },
        };
      }
    }
    return {
      id: "cand_nl",
      statement: `No ${subjectNoun} within ${meters.toFixed(
        1
      )} m of any ${targetNoun}.`,
      kind: "keep_clear_of",
      params: { meters, kinds: [subject], fromKinds: [target] },
      rationale: `Read from the instruction: "${text.trim()}"`,
      knob: { label: "Clearance", value: meters, min: 0.5, max: 20, step: 0.5 },
    };
  }

  if (regionHit) {
    const region = regionHit === "center" ? "centre" : regionHit;
    const zone = regionRect(region, world.floor.widthM, world.floor.heightM);
    const applied = subject ? [subject] : SEATING_KINDS;
    const noun = subject
      ? `${CATALOG[subject].label.toLowerCase()}s`
      : "seating";
    return {
      id: "cand_nl",
      statement: `No ${noun} in the ${region} area of the floor.`,
      kind: "keep_out_zone",
      params: { zone, zoneName: region, kinds: applied },
      rationale: `Read from the instruction: "${text.trim()}"`,
    };
  }

  if (subject && distance !== null && near) {
    return {
      id: "cand_nl",
      statement: `Keep at least ${distance.toFixed(1)} m of clearance around every ${CATALOG[
        subject
      ].label.toLowerCase()}.`,
      kind: "min_clearance",
      params: { meters: distance, kinds: [subject] },
      rationale: `Read from the instruction: "${text.trim()}"`,
      knob: { label: "Clearance", value: distance, min: 0.5, max: 10, step: 0.5 },
    };
  }

  const fallbackKind = subject ?? KIND_ORDER[1];
  const centre = regionRect("centre", world.floor.widthM, world.floor.heightM);
  return {
    id: "cand_nl",
    statement: text.trim().replace(/\s+/g, " ").replace(/\.?$/, "."),
    kind: "keep_out_zone",
    params: { zone: centre, zoneName: "centre", kinds: [fallbackKind] },
    rationale:
      "The instruction did not name a distance or a pair of objects, so it needs editing before it can be enforced.",
  };
}
