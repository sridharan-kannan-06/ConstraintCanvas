"use client";

import { useMemo, useState } from "react";
import { evaluateWorld } from "@/lib/rules";
import {
  acceptAll,
  acceptItem,
  deleteRule,
  rejectAll,
  rejectItem,
  toggleRule,
} from "@/lib/store";
import { useAppState } from "@/lib/useStore";
import type { Rule, RuleSource } from "@/lib/types";
import { IconCheck, IconClose, IconTrash } from "./icons";

const SOURCE_LABEL: Record<RuleSource, string> = {
  builtin: "built in",
  rejection: "from a rejection",
  human: "authored",
  agent_proposed: "agent drafted",
};

function ProposalTray() {
  const state = useAppState();
  const pending = state.pending;
  if (!pending) return null;

  const live = pending.items.filter((i) => i.status === "pending");

  return (
    <section className="tray">
      <div className="panel-head">
        <span className="panel-title">Proposal tray</span>
        <span className="tag agent_proposed">
          {pending.origin === "optimiser" ? "optimiser" : "agent"}
        </span>
        <div className="header-spacer" />
        <span className="palette-meta">{live.length} pending</span>
      </div>
      <div className="tray-summary">{pending.summary}</div>
      <div className="btn-row">
        <button className="btn small" onClick={acceptAll} disabled={live.length === 0}>
          Accept all
        </button>
        <button
          className="btn small secondary"
          onClick={rejectAll}
          disabled={live.length === 0}
        >
          Reject all
        </button>
      </div>
      <div className="tray-items">
        {pending.items.map((item) => (
          <div
            key={item.id}
            className={`tray-item${item.status !== "pending" ? " done" : ""}`}
          >
            <span className="tray-item-text">{item.description}</span>
            {item.status === "pending" ? (
              <>
                <button
                  className="icon-btn accept"
                  title="Accept this item"
                  onClick={() => acceptItem(item.id)}
                >
                  <IconCheck />
                </button>
                <button
                  className="icon-btn reject"
                  title="Reject this item and capture the rule behind it"
                  onClick={() => rejectItem(item.id)}
                >
                  <IconClose />
                </button>
              </>
            ) : (
              <span className={`tag${item.status === "rejected" ? " danger" : ""}`}>
                {item.status}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RuleRow({ rule, fresh }: { rule: Rule; fresh: boolean }) {
  return (
    <div
      className={`rule${rule.enabled ? "" : " disabled"}${fresh ? " fresh" : ""}`}
    >
      <div className="rule-top">
        <span className="rule-statement">{rule.statement}</span>
        <button
          className={`toggle${rule.enabled ? " on" : ""}`}
          onClick={() => toggleRule(rule.id)}
          title={rule.enabled ? "Waive this rule" : "Reinstate this rule"}
          aria-pressed={rule.enabled}
        />
        {rule.source !== "builtin" && (
          <button
            className="icon-btn"
            onClick={() => deleteRule(rule.id)}
            title="Revoke this rule permanently"
          >
            <IconTrash />
          </button>
        )}
      </div>
      <div className="rule-meta">
        <span className={`tag ${rule.source}`}>{SOURCE_LABEL[rule.source]}</span>
        <span className="rule-origin">{rule.provenance.trigger}</span>
      </div>
    </div>
  );
}

export default function RightRail() {
  const state = useAppState();
  const [tab, setTab] = useState<"rules" | "violations">("rules");
  const violations = useMemo(() => evaluateWorld(state.world), [state.world]);

  const rules = state.world.rules;
  const authored = rules.filter((r) => r.source !== "builtin");
  const newestId = authored.length ? authored[authored.length - 1].id : null;
  const lockedCount = state.world.objects.filter((o) => o.locked).length;

  return (
    <aside className="rail-right">
      <ProposalTray />

      <div className="tabs">
        <button
          className={`tab${tab === "rules" ? " active" : ""}`}
          onClick={() => setTab("rules")}
        >
          Rulebook <span className="tab-count">{rules.length}</span>
        </button>
        <button
          className={`tab${tab === "violations" ? " active" : ""}`}
          onClick={() => setTab("violations")}
        >
          Violations <span className="tab-count">{violations.length}</span>
        </button>
      </div>

      {tab === "rules" ? (
        <div className="panel-body">
          <div
            className="empty"
            style={{ borderBottom: "1px solid var(--cds-border-subtle-00)" }}
          >
            {authored.length} rule{authored.length === 1 ? "" : "s"} authored this
            session, {lockedCount} object{lockedCount === 1 ? "" : "s"} locked.
            Every agent proposal is checked against this list before it can reach
            you.
          </div>
          {[...rules].reverse().map((rule) => (
            <RuleRow key={rule.id} rule={rule} fresh={rule.id === newestId} />
          ))}
        </div>
      ) : (
        <div className="panel-body">
          {violations.length === 0 ? (
            <div className="empty">Nothing on the floor breaks an active rule.</div>
          ) : (
            violations.map((v, i) => (
              <div className="violation-row" key={`${v.ruleId}-${i}`}>
                <div>{v.ruleStatement}</div>
                <div className="violation-margin">{v.margin}</div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
