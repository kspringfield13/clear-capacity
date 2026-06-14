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
