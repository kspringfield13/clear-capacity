import type { WeeklyCapacitySnapshot } from "../../../../packages/domain/src/models";
import type { Screen } from "./types";

// Reusable proactive-alert engine for the menu-bar app. Pure and metrics-only: a
// rule may read derived capacity numbers but must NEVER put a window title or app
// name in user-facing text (privacy is a hard constraint). Each rule returns an
// alert or null; the engine surfaces the first one that fires. New proactive
// behaviours plug in as additional rules without touching the wiring.

export type ProactiveAlertSeverity = "info" | "warning";

export interface ProactiveAlert {
  /** Stable identifier for the rule that produced this alert. */
  id: string;
  rule_id: string;
  severity: ProactiveAlertSeverity;
  /** Short headline; metrics/counts only. */
  title: string;
  /** One-line explanation; metrics/counts only. */
  body: string;
  /** Where clicking the alert should take the user. */
  action: Screen;
  /**
   * Coarse fingerprint of the firing condition. Two evaluations that share a
   * signature are treated as "the same alert" — used to de-duplicate OS
   * notifications and to honour a user dismissal until the condition changes.
   */
  signature: string;
}

export interface ProactiveAlertSettings {
  /** Master opt-in. Off by default — same posture as visual context. */
  enabled: boolean;
  /** Per-rule toggle for the capacity guardrail. */
  capacityGuardrailEnabled: boolean;
  /** Reliable-new-work-capacity floor (%) that trips the guardrail. */
  capacityThresholdPct: number;
}

export const DEFAULT_PROACTIVE_ALERT_SETTINGS: ProactiveAlertSettings = {
  enabled: false,
  capacityGuardrailEnabled: true,
  capacityThresholdPct: 10,
};

/** Carryover-risk ceiling (%) that also trips the guardrail, independent of capacity. */
export const CARRYOVER_RISK_ALERT_THRESHOLD_PCT = 35;

export interface ProactiveAlertRuntime {
  /** Last fired signature per rule — prevents re-firing the same condition. */
  lastFiredSignatureByRule: Record<string, string>;
  /** ISO timestamp of the most recent OS notification (global gap throttle). */
  lastFiredAt: string | null;
  /** OS notifications fired per local date key (daily cap). */
  firedCountByDate: Record<string, number>;
}

export const EMPTY_PROACTIVE_ALERT_RUNTIME: ProactiveAlertRuntime = {
  lastFiredSignatureByRule: {},
  lastFiredAt: null,
  firedCountByDate: {},
};

export interface ProactiveAlertInput {
  snapshot: WeeklyCapacitySnapshot;
  hasWorkBlocks: boolean;
}

type ProactiveAlertRule = (
  input: ProactiveAlertInput,
  settings: ProactiveAlertSettings,
) => ProactiveAlert | null;

// Bucket a value so small fluctuations around a threshold don't churn the
// signature (and therefore don't re-fire a fresh OS notification each tick).
function bucket(value: number, size: number): number {
  return Math.round(value / size) * size;
}

const capacityGuardrailRule: ProactiveAlertRule = (input, settings) => {
  const cap = input.snapshot.reliable_new_work_capacity_pct;
  const carryover = input.snapshot.carryover_risk_pct;
  const lowCapacity = cap <= settings.capacityThresholdPct;
  const highCarryover = carryover >= CARRYOVER_RISK_ALERT_THRESHOLD_PCT;
  if (!lowCapacity && !highCarryover) return null;

  const reasons: string[] = [];
  if (lowCapacity) reasons.push(`reliable new-work capacity is down to ${Math.round(cap)}%`);
  if (highCarryover) reasons.push(`carryover risk is at ${Math.round(carryover)}%`);

  const signature = `capacity:${lowCapacity ? `low-${bucket(cap, 2)}` : "ok"}:${highCarryover ? `carry-${bucket(carryover, 5)}` : "ok"}`;

  // Sentence-case the joined reasons without leaking any non-metric content.
  const detail = reasons.join(" and ");
  return {
    id: "capacity-guardrail",
    rule_id: "capacity-guardrail",
    severity: "warning",
    title: "Capacity running low",
    body: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}. Review your week before taking on new work.`,
    action: "weekly",
    signature,
  };
};

const RULES: ProactiveAlertRule[] = [capacityGuardrailRule];

function isRuleEnabled(ruleId: string, settings: ProactiveAlertSettings): boolean {
  switch (ruleId) {
    case "capacity-guardrail":
      return settings.capacityGuardrailEnabled;
    default:
      return true;
  }
}

/**
 * Evaluate every enabled rule and return the first alert that fires (or null).
 * Returns null when alerts are disabled or there is no workload to reason about.
 */
export function evaluateProactiveAlerts(
  input: ProactiveAlertInput,
  settings: ProactiveAlertSettings,
): ProactiveAlert | null {
  if (!settings.enabled || !input.hasWorkBlocks) return null;
  for (const rule of RULES) {
    const candidate = rule(input, settings);
    if (candidate && isRuleEnabled(candidate.rule_id, settings)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Decide whether an alert warrants an interruptive OS notification right now,
 * given prior firing history. The in-app banner is shown regardless; this gate
 * only governs the toast so the menu bar stays quiet.
 */
export function shouldFireOsNotification(
  alert: ProactiveAlert,
  runtime: ProactiveAlertRuntime,
  now: number,
  todayKey: string,
  maxPerDay: number,
  minGapMs: number,
): boolean {
  if (runtime.lastFiredSignatureByRule[alert.rule_id] === alert.signature) return false;
  if ((runtime.firedCountByDate[todayKey] ?? 0) >= maxPerDay) return false;
  if (runtime.lastFiredAt && now - new Date(runtime.lastFiredAt).getTime() < minGapMs) return false;
  return true;
}

/** Record that an OS notification fired, returning the next runtime snapshot. */
export function recordFiredAlert(
  alert: ProactiveAlert,
  runtime: ProactiveAlertRuntime,
  nowIso: string,
  todayKey: string,
): ProactiveAlertRuntime {
  return {
    lastFiredSignatureByRule: {
      ...runtime.lastFiredSignatureByRule,
      [alert.rule_id]: alert.signature,
    },
    lastFiredAt: nowIso,
    firedCountByDate: {
      ...runtime.firedCountByDate,
      [todayKey]: (runtime.firedCountByDate[todayKey] ?? 0) + 1,
    },
  };
}
