import type {
  WeeklyCapacitySnapshot,
  WeeklyNarrative,
  WorkBlock,
  WorkCategory,
  WorkMode
} from "../../domain/src/models";
import { workCategories, workModes } from "../../domain/src/taxonomy";

const BASELINE_CAPACITY = 100;
const MAX_RELIABLE_NEW_WORK = 40;

function roundPct(value: number) {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sum(blocks: WorkBlock[], predicate: (block: WorkBlock) => boolean) {
  return blocks.filter(predicate).reduce((total, block) => total + block.estimated_capacity_pct, 0);
}

function allocationBy<T extends string>(
  labels: T[],
  blocks: WorkBlock[],
  selector: (block: WorkBlock) => T
) {
  return labels
    .map((label) => ({
      label,
      value: roundPct(sum(blocks, (block) => selector(block) === label))
    }))
    .filter((item) => item.value > 0);
}

export function computeWeeklyCapacitySnapshot(
  weekId: string,
  blocks: WorkBlock[]
): WeeklyCapacitySnapshot {
  const included = blocks.filter((block) => block.planned_status !== "blocked" || block.blocker_flag);
  const allocated = roundPct(sum(included, () => true));
  const meetingPct = roundPct(sum(included, (block) => block.category === "Meetings / stakeholder syncs"));
  const recurringPct = roundPct(
    sum(
      included,
      (block) =>
        block.category === "Recurring reporting" ||
        block.category === "Admin / coordination" ||
        block.planned_status === "fixed"
    )
  );
  const plannedPct = roundPct(sum(included, (block) => block.planned_status === "planned"));
  const reactivePct = roundPct(
    sum(
      included,
      (block) =>
        block.planned_status === "unplanned" ||
        block.mode === "Reactive" ||
        block.category === "Ad hoc stakeholder requests"
    )
  );
  const blockedPct = roundPct(
    sum(included, (block) => block.blocker_flag || block.category === "Blocked / waiting / dependency delay")
  );
  const deepWorkPct = roundPct(sum(included, (block) => block.mode === "Deep work"));
  const fragmentedWorkPct = roundPct(sum(included, (block) => block.mode === "Fragmented"));
  const carryoverRiskPct = roundPct(sum(included, (block) => !block.user_verified && block.confidence < 0.75) * 0.55);
  // Improved fragmentation: count context switches more accurately
  const contextSwitchScore = clamp(
    included.filter((block) => block.mode === "Fragmented" || block.mode === "Reactive").length /
      Math.max(included.length, 1),
    0,
    1
  );
  const wipLoadScore = clamp(new Set(included.map((block) => block.project_name)).size / 10, 0, 1);
  const fragmentationPenalty = roundPct(contextSwitchScore * 12);
  const wipPenalty = roundPct(wipLoadScore * 10);
  const reliableNewWorkCapacityPct = clamp(
    roundPct(
      BASELINE_CAPACITY -
        recurringPct -
        carryoverRiskPct -
        reactivePct * 0.72 -
        fragmentationPenalty -
        wipPenalty
    ),
    0,
    MAX_RELIABLE_NEW_WORK
  );
  const averageConfidence =
    included.reduce((total, block) => total + block.confidence, 0) / Math.max(included.length, 1);

  return {
    week_id: weekId,
    capacity_baseline_pct: BASELINE_CAPACITY,
    allocated_pct: allocated,
    deep_work_pct: deepWorkPct,
    fragmented_work_pct: fragmentedWorkPct,
    meeting_pct: meetingPct,
    reactive_pct: reactivePct,
    planned_pct: plannedPct,
    blocked_pct: blockedPct,
    recurring_pct: recurringPct,
    reliable_new_work_capacity_pct: reliableNewWorkCapacityPct,
    carryover_risk_pct: carryoverRiskPct,
    wip_load_score: Number(wipLoadScore.toFixed(2)),
    context_switch_score: Number(contextSwitchScore.toFixed(2)),
    summary_confidence: Number(averageConfidence.toFixed(2)),
    category_allocation: allocationBy<WorkCategory>(workCategories, included, (block) => block.category),
    work_mode_allocation: allocationBy<WorkMode>(workModes, included, (block) => block.mode)
  };
}

export type ForecastAccuracyRating = "on_target" | "close" | "off";

export interface ForecastAccuracy {
  predicted_pct: number;
  actual_pct: number;
  error_pts: number; // absolute points between forecast and outcome
  signed_error_pts: number; // predicted - actual (positive = over-predicted)
  rating: ForecastAccuracyRating;
}

/**
 * Score a past forecast against the capacity the model actually computed for the
 * week it targeted. Pure and primitive-only so it stays unit-testable and free of
 * frontend persistence types. Thresholds are point-deltas on the 0–100 reliable
 * new-work capacity scale.
 */
export function scoreForecastAccuracy(predictedPct: number, actualPct: number): ForecastAccuracy {
  const signed = roundPct(predictedPct - actualPct);
  const error = Math.abs(signed);
  const rating: ForecastAccuracyRating = error <= 5 ? "on_target" : error <= 12 ? "close" : "off";
  return {
    predicted_pct: roundPct(predictedPct),
    actual_pct: roundPct(actualPct),
    error_pts: error,
    signed_error_pts: signed,
    rating
  };
}

/**
 * Rolling personal baselines for the headline capacity metrics. `week_count` is how
 * many prior-week snapshots fed the medians; each metric is the median over the most
 * recent `BASELINE_WINDOW_WEEKS` of them (or `null` when there is no history). Lets the
 * UI read this week's numbers against the user's own norm instead of an absolute scale.
 */
export interface CapacityBaselines {
  week_count: number;
  reactive_pct: number | null;
  meeting_pct: number | null;
  context_switch_score: number | null;
  reliable_new_work_capacity_pct: number | null;
}

const BASELINE_WINDOW_WEEKS = 6;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Compute rolling medians for the headline capacity metrics over the most recent
 * `BASELINE_WINDOW_WEEKS` snapshots in `history`. Pure and domain-typed (no persistence
 * types) so it stays unit-testable. Input is sorted by `week_id` defensively; pass
 * prior-week snapshots ONLY — exclude the week being compared so it doesn't pull its own
 * median toward itself.
 */
export function computeCapacityBaselines(history: WeeklyCapacitySnapshot[]): CapacityBaselines {
  const window = [...history]
    .sort((left, right) => left.week_id.localeCompare(right.week_id))
    .slice(-BASELINE_WINDOW_WEEKS);
  return {
    week_count: window.length,
    reactive_pct: median(window.map((snapshot) => snapshot.reactive_pct)),
    meeting_pct: median(window.map((snapshot) => snapshot.meeting_pct)),
    context_switch_score: median(window.map((snapshot) => snapshot.context_switch_score)),
    reliable_new_work_capacity_pct: median(
      window.map((snapshot) => snapshot.reliable_new_work_capacity_pct)
    )
  };
}

export function generateWeeklyNarrative(snapshot: WeeklyCapacitySnapshot): WeeklyNarrative {
  const reactiveDominant = snapshot.reactive_pct > snapshot.planned_pct * 0.7;
  const denseMeetings = snapshot.meeting_pct >= 18;
  const fragmented = snapshot.context_switch_score >= 0.45;
  const topDrivers = [
    reactiveDominant ? "Reactive work displaced planned analysis time" : "Planned work remained the largest allocation",
    denseMeetings ? "Meeting density consumed a material part of the week" : "Meetings stayed below the main risk threshold",
    fragmented ? "Frequent context switches reduced reliable delivery capacity" : "Deep-work windows were relatively protected"
  ];

  const headline = reactiveDominant
    ? "Reactive support is constraining delivery capacity."
    : "Planned work is moving, with manageable reactive load.";

  return {
    week_id: snapshot.week_id,
    headline,
    summary_text: `Estimated allocation reached ${snapshot.allocated_pct}% of a standard 40-hour week. Planned work accounted for ${snapshot.planned_pct}%, reactive work for ${snapshot.reactive_pct}%, and meetings for ${snapshot.meeting_pct}%. Reliable new-work capacity for next week is estimated at ${snapshot.reliable_new_work_capacity_pct}%.`,
    key_drivers: topDrivers,
    manager_ready_summary: `This week appears to have ${snapshot.reliable_new_work_capacity_pct}% reliable capacity for new planned work next week. The main constraints are reactive load, recurring commitments, carryover risk, and fragmentation. The estimate confidence is ${Math.round(snapshot.summary_confidence * 100)}%, and the user should review low-confidence blocks before sharing.`
  };
}
