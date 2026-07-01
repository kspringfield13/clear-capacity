import type {
  RawEvent,
  UserCorrection,
  WeeklyCapacitySnapshot,
  WeeklyNarrative,
  WorkBlock,
  WorkCategory,
  WorkMode
} from "../../domain/src/models";
import { workCategories, workModes } from "../../domain/src/taxonomy";

const BASELINE_CAPACITY = 100;
// Target total utilization for the reliable new-work estimate: the ~80% queueing "knee". For an
// M/M/1 queue residence time scales as 1/(1−ρ), so wait time goes vertical past ρ≈0.8 — past the
// knee a knowledge worker's latency (and carryover) explodes. So instead of offering "all the
// hours left up to 100%", offer only enough new work to bring TOTAL utilization up to this knee,
// the only stable operating point. See docs/heuristics-vs-research.md §1.
const TARGET_UTILIZATION_PCT = 80;
// Retained guardrail: never promise more than 40% of a week as reliable new work, even when
// current utilization is near zero (a near-empty week shouldn't license a 60–80% new-work
// commitment on the strength of one quiet week). This was the old fixed ceiling; it stays as the
// conservative floor under the target-utilization model. Hand-tuned; see §1.
const MAX_RELIABLE_NEW_WORK = 40;

function roundPct(value: number) {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Take the last `n` entries of an array — the rolling-window tail used by the accuracy-trend and
// baseline rollups. Guards `n <= 0` explicitly: `array.slice(-0)` is `slice(0)`, which returns the
// WHOLE array rather than an empty tail, so a non-positive window must short-circuit to `[]`.
function sliceLastN<T>(items: T[], n: number): T[] {
  if (n <= 0) return [];
  return items.slice(-n);
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
  // Discount unverified low-confidence work to 55% when scoring carryover risk: only a fraction of
  // it is likely to actually spill into next week. The 0.55 weight is hand-tuned, not derived —
  // see docs/heuristics-vs-research.md §1–2 ("Document the 0.72 / 0.55 / 40% constants").
  const carryoverRiskPct = roundPct(sum(included, (block) => !block.user_verified && block.confidence < 0.75) * 0.55);
  // Improved fragmentation: count context switches more accurately
  const contextSwitchScore = clamp(
    included.filter((block) => block.mode === "Fragmented" || block.mode === "Reactive").length /
      Math.max(included.length, 1),
    0,
    1
  );
  // Work-in-progress penalty. Context-switching cost grows FASTER than the raw count of
  // concurrent projects (the cost is closer to combinatorial — every extra project competes
  // with all the others for attention), and the research pass found fragmentation is likely
  // *under*-weighted, not over- (docs/heuristics-vs-research.md §3: collaboration is ~85% of
  // the week, sustained attention ~47s). So curve the score upward (quadratic) instead of the
  // old forgiving linear count/10: a handful of parallel projects now hurts disproportionately
  // more than the same work volume on a single project. Squaring `count / 7` keeps the score
  // near the old linear value around 5 projects, gentler below it (few projects = little
  // switching), and harsher above — saturating the penalty at 7 concurrent projects (the
  // "badly overloaded" knee). Still clamped to [0,1].
  const activeProjectCount = new Set(included.map((block) => block.project_name)).size;
  const wipLoadScore = clamp(Math.pow(activeProjectCount / 7, 2), 0, 1);
  const fragmentationPenalty = roundPct(contextSwitchScore * 12);
  const wipPenalty = roundPct(wipLoadScore * 10);
  // Forward-committed load = the week's current utilization for the target-utilization model.
  // Sum the commitments that carry into next week: recurring work that repeats, carryover that
  // spills in, reactive load (counted at only ~72% of its face value — Mark, Gudith & Klocke,
  // CHI 2008, found reactive/interrupted work costs higher stress, effort and time pressure, so
  // it delivers less *sustainable* throughput; 0.72 is hand-tuned, docs/heuristics-vs-research.md
  // §2), plus the fragmentation/WIP drag. This replaces the old implicit "100% baseline".
  const committedUtilizationPct = roundPct(
    recurringPct + carryoverRiskPct + reactivePct * 0.72 + fragmentationPenalty + wipPenalty
  );
  // Reliable new work = headroom that brings total utilization up to the ~80% knee, clamped to a
  // [0, 40] guardrail. More explainable than the old 0–40% clamp ("you're at 64% committed; ~16%
  // keeps you under the 80% reliability knee") and removes the arbitrary 100% baseline; the 40%
  // cap stays as the old-behavior floor against over-promising on a near-empty week. See §1.
  const reliableNewWorkCapacityPct = clamp(
    TARGET_UTILIZATION_PCT - committedUtilizationPct,
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
    committed_utilization_pct: committedUtilizationPct,
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
 * A rolling track record of how far past forecasts have landed from the model's eventual
 * computation, so the UI can frame the latest forecast with evidence ("forecasts have
 * averaged ±N pts over the last K weeks"). `week_count` is how many scored forecasts fed
 * the average.
 */
export interface ForecastAccuracyTrend {
  week_count: number;
  mean_abs_error_pts: number; // mean absolute point error over the window
}

const ACCURACY_TREND_WINDOW_WEEKS = 8;

/**
 * Roll the most recent scored forecasts into a single mean-absolute-error. Each input pairs a
 * past forecast's predicted reliable capacity with the capacity the model actually computed for
 * the week it targeted (keyed by `week_id`, one entry per week). Pure and primitive-only like
 * `scoreForecastAccuracy`: it reuses that helper for the per-week error so rounding/thresholds
 * stay consistent, sorts by `week_id` defensively, and averages the most recent
 * `ACCURACY_TREND_WINDOW_WEEKS`. Returns `null` when there is nothing scored so the caller can
 * hide the line.
 */
export function summarizeForecastAccuracy(
  scored: { week_id: string; predicted_pct: number; actual_pct: number }[]
): ForecastAccuracyTrend | null {
  if (scored.length === 0) return null;
  const window = sliceLastN(
    [...scored].sort((left, right) => left.week_id.localeCompare(right.week_id)),
    ACCURACY_TREND_WINDOW_WEEKS
  );
  const totalError = window.reduce(
    (sum, item) => sum + scoreForecastAccuracy(item.predicted_pct, item.actual_pct).error_pts,
    0
  );
  return {
    week_count: window.length,
    mean_abs_error_pts: roundPct(totalError / window.length)
  };
}

/** A scored forecast keyed by the week it targeted, for the per-week track-record list. */
export interface ForecastTrackRecordEntry extends ForecastAccuracy {
  week_id: string;
}

/**
 * Build a per-week predicted-vs-actual track record so the UI can list how every past forecast
 * landed (rating chip + signed error) and the model can be audited over time. Each input pairs a
 * past forecast's predicted reliable capacity with the capacity the model actually computed for
 * the week it targeted (one entry per week). Pure and primitive-only like
 * `summarizeForecastAccuracy`; reuses `scoreForecastAccuracy` so rounding/thresholds stay
 * consistent with the single-week banner, and sorts newest week first for display.
 */
export function buildForecastTrackRecord(
  scored: { week_id: string; predicted_pct: number; actual_pct: number }[]
): ForecastTrackRecordEntry[] {
  return [...scored]
    .sort((left, right) => right.week_id.localeCompare(left.week_id))
    .map((item) => ({
      week_id: item.week_id,
      ...scoreForecastAccuracy(item.predicted_pct, item.actual_pct)
    }));
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
  const window = sliceLastN(
    [...history].sort((left, right) => left.week_id.localeCompare(right.week_id)),
    BASELINE_WINDOW_WEEKS
  );
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

/**
 * A systematic mislabel surfaced from the user's correction history: the same field was
 * re-labeled from `from_value` to `to_value` at least `SYSTEMATIC_CORRECTION_THRESHOLD`
 * times, which suggests a repeatable bias in the model's labeling for that pattern.
 */
export interface CorrectionBias {
  field: UserCorrection["field"];
  from_value: string;
  to_value: string;
  count: number;
}

export interface CorrectionBiasAnalysis {
  total_corrections: number;
  /** Corrections eligible for bias detection (label fields with a real value change). */
  label_correction_count: number;
  /** Systematic from→to patterns, sorted by count descending. Empty when none reach the threshold. */
  biases: CorrectionBias[];
}

// Fields where a from→to edit represents a repeatable classification mislabel. Free-text and
// timestamp edits are excluded — they don't form a meaningful directional bias signal.
const BIAS_LABEL_FIELDS: ReadonlySet<UserCorrection["field"]> = new Set([
  "category",
  "mode",
  "planned_status",
  "stakeholder_group",
  "blocker_flag"
]);

const SYSTEMATIC_CORRECTION_THRESHOLD = 3;

/**
 * Surface systematic mislabels from the user's correction history so the model's blind spots
 * are visible — no retraining, this just closes the feedback loop. A bias is any
 * `(field, old_value → new_value)` pattern repeated at least `SYSTEMATIC_CORRECTION_THRESHOLD`
 * times across the label fields (e.g. category X→Y corrected ≥3×, or planned→unplanned drift).
 * Pure and domain-typed (no persistence/frontend types) so it stays unit-testable.
 */
export function analyzeCorrections(corrections: UserCorrection[]): CorrectionBiasAnalysis {
  const counts = new Map<string, CorrectionBias>();
  let labelCount = 0;
  for (const correction of corrections) {
    if (!BIAS_LABEL_FIELDS.has(correction.field)) continue;
    if (correction.old_value === correction.new_value) continue;
    labelCount += 1;
    // JSON-encode the (field, from, to) triple into the dedup key so distinct corrections can
    // never alias on a shared delimiter (label values like "Planned analysis / project work"
    // carry spaces and slashes), and the source stays plain text — no control-char separators.
    const key = JSON.stringify([correction.field, correction.old_value, correction.new_value]);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        field: correction.field,
        from_value: correction.old_value,
        to_value: correction.new_value,
        count: 1
      });
    }
  }
  const biases = [...counts.values()]
    .filter((bias) => bias.count >= SYSTEMATIC_CORRECTION_THRESHOLD)
    .sort((left, right) => right.count - left.count);
  return {
    total_corrections: corrections.length,
    label_correction_count: labelCount,
    biases
  };
}

/**
 * Chat-driven interruption load, derived from imported workplace-chat events. Chat is the one
 * source that exposes reactive interruption density — the part of the capacity model that
 * calendar + git can't see — so this quantifies how much it fragmented the week's deep work,
 * feeding the same `context_switch_score` / `fragmented_work_pct` story.
 *
 * - `messages_per_active_hour` is the interruption density while engaged in chat bursts.
 * - `burst_count` is the reactive-burst frequency (one imported chat event per burst).
 * - `interrupted_deep_work_pct` is how often a chat burst overlapped a deep-work block in the
 *   same window — the interleave signal.
 */
export interface InterruptionLoadAnalysis {
  /** Reactive chat bursts in the window (one per imported chat event). */
  burst_count: number;
  /** Total messages across bursts (metadata count only — never message text). */
  message_count: number;
  /** Direct @-mentions — the sharpest interruption signal. */
  mention_count: number;
  /**
   * Share (0–100) of reactive messages that were direct @-mentions — how much of the chat
   * pressure was aimed at the user by name (harder to batch/defer than ambient channel chatter).
   * Floored to 1 when there is any mention volume (so a non-zero count never displays alongside
   * "0%"), capped at 100 to stay sane if a malformed export reports more mentions than messages;
   * 0 only when there are no mentions or no messages to divide by.
   */
  mention_pct: number;
  /** Hours spent inside chat bursts. */
  active_hours: number;
  /** Messages per active chat hour — interruption density while engaged. */
  messages_per_active_hour: number;
  /** Deep-work blocks active during the chat window. */
  deep_work_block_count: number;
  /** Deep-work blocks a chat burst overlapped (interleaved). */
  interrupted_deep_work_count: number;
  /** Share (0–100) of in-window deep-work blocks a chat burst interleaved. */
  interrupted_deep_work_pct: number;
  /** Distinct local weekdays that carried reactive message volume (0–7; caller scopes to a week). */
  active_day_count: number;
  /** Weekday name (local time) reactive message volume peaked on; null when no message volume. */
  peak_day: string | null;
  /** Reactive messages on `peak_day` (metadata count only); 0 when `peak_day` is null. */
  peak_day_message_count: number;
  /**
   * Local hour (0–23) reactive volume concentrated in ON the peak day — the time-of-day axis the
   * weekday peak can't show. Non-null exactly when `peak_day` is non-null (the peak day always
   * carries ≥1 message-bearing hour), so it renders alongside the peak-day note.
   */
  peak_hour: number | null;
  /**
   * Lowest-volume *active* weekday (local time) — the quietest day to protect for deep work;
   * null when there are fewer than 2 active days (no quieter day to contrast against the peak).
   */
  calm_day: string | null;
  /** Reactive messages that landed outside core hours (before 08:00 / at-or-after 18:00 local). */
  after_hours_message_count: number;
  /**
   * Share (0–100) of reactive messages that landed after hours; 0 only when there is no after-hours
   * volume, floored to 1 when there is any (so a non-zero count never displays alongside "0%").
   */
  after_hours_pct: number;
}

// Core working-hour window (local time) for the after-hours reactive-load signal. Reactive chat
// that starts before 08:00 or at/after 18:00 is attributed to "after hours" — work bleeding into
// personal time, an unsustainable-pace cue (Pencavel's diminishing-returns-past-long-hours point,
// docs/heuristics-vs-research.md §5, applied to *when* the load lands, not just how much). Hand-set
// boundary — there is no per-user schedule yet; a burst is bucketed by its START hour, consistent
// with the weekday bucketing below.
const CORE_HOURS_START = 8;
const CORE_HOURS_END = 18;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/** Parse a metadata count string (`messages`/`mentions`); non-numeric/negative → 0. */
function metadataCount(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

/**
 * Quantify chat-driven interruption load from imported chat events plus the work blocks they
 * could have fragmented. Pure and domain-typed (no persistence/frontend types) so it stays
 * unit-testable like `scoreForecastAccuracy`. **Privacy:** reads ONLY the metadata-only counts
 * the chat parser emits (`messages`/`mentions`) plus event time spans — never message text.
 * Returns `null` when there is no chat signal so the caller can hide the panel.
 */
export function analyzeInterruptionLoad(
  chatEvents: RawEvent[],
  workBlocks: WorkBlock[]
): InterruptionLoadAnalysis | null {
  const bursts: { start: number; end: number }[] = [];
  // Reactive message volume bucketed by local weekday (0–6) so we can name the day focus took the
  // most chat pressure. Local time is the right semantic — the user's sense of "Wednesday".
  const dayMessages = new Map<number, number>();
  // Reactive message volume bucketed by (local weekday, local hour) via `dayIndex * 24 + hour`, so
  // once the peak day is known we can name the hour reactive load concentrated in ON that day —
  // the time-of-day axis, not conflated with any other day's hourly pattern.
  const dayHourMessages = new Map<number, number>();
  let messageCount = 0;
  let mentionCount = 0;
  let afterHoursMessages = 0;
  let activeMs = 0;
  for (const event of chatEvents) {
    if (event.source_type !== "chat") continue;
    const start = new Date(event.timestamp_start).getTime();
    const end = new Date(event.timestamp_end).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    bursts.push({ start, end });
    activeMs += end - start;
    // `metadata` is typed non-null, but events can arrive from untrusted persisted
    // JSON — fall back to an empty bag so a malformed record can't throw here.
    const metadata = event.metadata ?? {};
    const messages = metadataCount(metadata.messages);
    messageCount += messages;
    mentionCount += metadataCount(metadata.mentions);
    // Bucket only message-bearing days so `active_day_count` and the peak both reflect actual
    // reactive volume — a malformed 0-message burst on a separate day can't inflate the count
    // (or trip the ≥2-day footnote gate) into implying activity it didn't carry.
    if (messages > 0) {
      const startDate = new Date(start);
      const dayIndex = startDate.getDay();
      dayMessages.set(dayIndex, (dayMessages.get(dayIndex) ?? 0) + messages);
      // Attribute the burst's messages to "after hours" by its start hour, mirroring the weekday
      // bucketing — a metadata-only sustainability cue, never message text.
      const startHour = startDate.getHours();
      dayHourMessages.set(
        dayIndex * 24 + startHour,
        (dayHourMessages.get(dayIndex * 24 + startHour) ?? 0) + messages
      );
      if (startHour < CORE_HOURS_START || startHour >= CORE_HOURS_END) {
        afterHoursMessages += messages;
      }
    }
  }
  if (bursts.length === 0) return null;

  // Name the weekday reactive volume peaked on. Iterate by ascending weekday index so ties resolve
  // to the lower index deterministically regardless of event order; strict `>` from a 0 baseline
  // leaves `peak_day` null for a burst-only week with no message counts (nothing worth naming).
  let peakDayIndex = -1;
  let peakDayMessages = 0;
  for (const dayIndex of [...dayMessages.keys()].sort((left, right) => left - right)) {
    const total = dayMessages.get(dayIndex) ?? 0;
    if (total > peakDayMessages) {
      peakDayMessages = total;
      peakDayIndex = dayIndex;
    }
  }

  // Within the peak day, name the local hour reactive volume concentrated in — the time-of-day the
  // user is likeliest to lose focus, an axis the weekday peak alone can't surface. Iterate hours
  // ascending with strict `>` so ties resolve to the earlier hour deterministically. The peak day
  // always carries ≥1 message-bearing hour bucket, so `peakHourIndex` is set whenever `peakDayIndex`
  // is — i.e. `peak_hour` is non-null exactly when `peak_day` is.
  let peakHourIndex = -1;
  let peakHourMessages = 0;
  if (peakDayIndex >= 0) {
    for (let hour = 0; hour < 24; hour += 1) {
      const total = dayHourMessages.get(peakDayIndex * 24 + hour) ?? 0;
      if (total > peakHourMessages) {
        peakHourMessages = total;
        peakHourIndex = hour;
      }
    }
  }

  // Name the calmest *active* weekday (lowest reactive volume) so the footnote can suggest a
  // concrete day to protect for deep work. Only meaningful with ≥2 active days — with one (or
  // zero) message-bearing day there is no quieter day to contrast against the peak, so leave it
  // null. Same ascending-index iteration + strict `<` from a high baseline → lowest-index-wins
  // tie-break, mirroring the peak computation above.
  let calmDayIndex = -1;
  if (dayMessages.size >= 2) {
    let calmDayMessages = Number.POSITIVE_INFINITY;
    for (const dayIndex of [...dayMessages.keys()].sort((left, right) => left - right)) {
      const total = dayMessages.get(dayIndex) ?? 0;
      if (total < calmDayMessages) {
        calmDayMessages = total;
        calmDayIndex = dayIndex;
      }
    }
  }

  // Scope deep-work blocks to the chat window so the interleave denominator reflects the period
  // chat could actually have fragmented, not the user's entire history.
  const windowStart = Math.min(...bursts.map((burst) => burst.start));
  const windowEnd = Math.max(...bursts.map((burst) => burst.end));
  const deepWorkInWindow = workBlocks
    .filter((block) => block.mode === "Deep work")
    .map((block) => ({
      start: new Date(block.start_time).getTime(),
      end: new Date(block.end_time).getTime()
    }))
    .filter(
      (span) =>
        !Number.isNaN(span.start) &&
        !Number.isNaN(span.end) &&
        span.start < windowEnd &&
        windowStart < span.end
    );

  const interrupted = deepWorkInWindow.filter((span) =>
    bursts.some((burst) => burst.start < span.end && span.start < burst.end)
  ).length;

  const activeHours = activeMs / 3_600_000;
  return {
    burst_count: bursts.length,
    message_count: messageCount,
    mention_count: mentionCount,
    // Floor to 1% when there is any mention volume (mirrors `after_hours_pct`) so a non-zero
    // count never renders beside "0%"; cap at 100 so a malformed export reporting more mentions
    // than messages can't exceed 100%. Guard `messageCount > 0` (a mentions-only, 0-message burst
    // is possible) so the division never yields Infinity.
    mention_pct:
      mentionCount > 0 && messageCount > 0
        ? Math.min(100, Math.max(1, Math.round((mentionCount / messageCount) * 100)))
        : 0,
    active_hours: Number(activeHours.toFixed(2)),
    messages_per_active_hour: activeHours > 0 ? Math.round(messageCount / activeHours) : 0,
    deep_work_block_count: deepWorkInWindow.length,
    interrupted_deep_work_count: interrupted,
    interrupted_deep_work_pct:
      deepWorkInWindow.length > 0 ? Math.round((interrupted / deepWorkInWindow.length) * 100) : 0,
    active_day_count: dayMessages.size,
    peak_day: peakDayIndex >= 0 ? WEEKDAY_NAMES[peakDayIndex] : null,
    peak_day_message_count: peakDayMessages,
    peak_hour: peakHourIndex >= 0 ? peakHourIndex : null,
    calm_day: calmDayIndex >= 0 ? WEEKDAY_NAMES[calmDayIndex] : null,
    after_hours_message_count: afterHoursMessages,
    // Floor to 1% when there is any after-hours volume so the footnote (gated on the count) never
    // shows "0%" beside a non-zero count. messageCount ≥ afterHoursMessages > 0 here, so safe.
    after_hours_pct:
      afterHoursMessages > 0 ? Math.max(1, Math.round((afterHoursMessages / messageCount) * 100)) : 0
  };
}

/**
 * A stakeholder group (channel / DM) the week's reactive chat work served, ranked by message
 * volume. Channel/participant labels only — never message content.
 */
export interface ChatStakeholderGroup {
  /** Channel/DM display label (e.g. "#data-requests", "DM · Priya"). Never message text. */
  label: string;
  /** Reactive bursts that involved this group (the concrete, always-exact count). */
  burst_count: number;
  /**
   * Share (0–100) of the window's reactive message *volume* this group accounts for. A burst
   * spanning multiple channels splits its volume evenly so no channel is over-credited; that
   * fractional weight drives the share but is never surfaced as a misleading rounded count.
   */
  share_pct: number;
}

export interface ChatStakeholderSummary {
  /** Total reactive messages across every group in the window (metadata counts only). */
  total_message_count: number;
  /** Distinct stakeholder groups seen, before the top-N cut. */
  group_count: number;
  /** Top groups by reactive message volume, descending. */
  groups: ChatStakeholderGroup[];
}

const DEFAULT_STAKEHOLDER_LIMIT = 4;
// Bursts with no channel/DM label (e.g. a DM export that omits the participant name) still
// served reactive time — bucket them honestly rather than silently dropping the volume.
const UNLABELED_STAKEHOLDER_GROUP = "Direct & untagged";

/** Split a metadata `channels` value ("#a, #b") into trimmed labels; missing/empty → []. */
function parseChannelLabels(value: string | null | undefined): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

/**
 * Rank the stakeholder groups (channels / DMs) the week's reactive chat work served, so the user
 * can see *who* their ad-hoc time went to — the collaboration view calendar + git can't surface.
 * Pure and domain-typed (no persistence/frontend types) so it stays unit-testable like
 * `analyzeInterruptionLoad`. **Privacy:** reads ONLY the metadata-only labels/counts the chat
 * parser emits (`channels` labels + `messages` count) plus event time spans — never message text.
 * A burst spanning multiple channels splits its volume evenly so no channel is over-credited.
 * Returns `null` when there is no chat signal so the caller can hide the panel.
 */
export function summarizeChatStakeholders(
  chatEvents: RawEvent[],
  options: { limit?: number } = {}
): ChatStakeholderSummary | null {
  const limit = Math.max(1, options.limit ?? DEFAULT_STAKEHOLDER_LIMIT);
  const groups = new Map<string, { label: string; weight: number; bursts: number }>();
  let totalMessages = 0;
  for (const event of chatEvents) {
    if (event.source_type !== "chat") continue;
    const start = new Date(event.timestamp_start).getTime();
    const end = new Date(event.timestamp_end).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    // `metadata` is typed non-null, but events can arrive from untrusted persisted JSON —
    // fall back to an empty bag so a malformed record can't throw here.
    const metadata = event.metadata ?? {};
    const messages = metadataCount(metadata.messages);
    const labels = parseChannelLabels(metadata.channels);
    const targets = labels.length > 0 ? labels : [UNLABELED_STAKEHOLDER_GROUP];
    const perLabel = messages / targets.length;
    totalMessages += messages;
    for (const label of targets) {
      const existing = groups.get(label) ?? { label, weight: 0, bursts: 0 };
      existing.weight += perLabel;
      existing.bursts += 1;
      groups.set(label, existing);
    }
  }
  // No reactive message volume (no chat events, or only zero-message bursts) → nothing worth
  // ranking, so hide the panel rather than render a row of meaningless 0% chips.
  if (totalMessages === 0) return null;

  const ranked = [...groups.values()]
    .sort((left, right) => right.weight - left.weight || right.bursts - left.bursts || left.label.localeCompare(right.label))
    .map((group) => ({
      label: group.label,
      burst_count: group.bursts,
      share_pct: Math.round((group.weight / totalMessages) * 100)
    }));

  return {
    total_message_count: totalMessages,
    group_count: ranked.length,
    groups: ranked.slice(0, limit)
  };
}

export function generateWeeklyNarrative(
  snapshot: WeeklyCapacitySnapshot,
  baselines?: CapacityBaselines | null
): WeeklyNarrative {
  const reactiveDominant = snapshot.reactive_pct > snapshot.planned_pct * 0.7;
  // "Dense meetings": an absolute `>= 18%`-of-week cut fires for nearly everyone — collaboration is
  // ~85% of the modern work week, so 18% (~7.2h) is below most people's normal meeting load and the
  // flag cries wolf (see docs/heuristics-vs-research.md §4). When ≥2 prior weeks of history exist,
  // compare against the user's OWN rolling median instead, flagging the week only when its meeting
  // share runs meaningfully (≥25%) above that personal norm. Fall back to the absolute 18% when
  // there isn't enough history to have a personal baseline (< 2 prior weeks, or a null median).
  const meetingMedian =
    baselines && baselines.week_count >= 2 ? baselines.meeting_pct : null;
  const denseMeetings =
    meetingMedian !== null ? snapshot.meeting_pct > meetingMedian * 1.25 : snapshot.meeting_pct >= 18;
  // Flag a fragmented week once the context-switch score crosses 0.45. Penalizing fragmentation is
  // well-grounded (collaboration is ~85% of the work week; sustained attention averages ~47s —
  // Mark 2023), and the model likely *under*-weights it; the exact 0.45 cut is hand-tuned, not
  // derived — see docs/heuristics-vs-research.md §3.
  const fragmented = snapshot.context_switch_score >= 0.45;
  const topDrivers = [
    reactiveDominant ? "Reactive work displaced planned analysis time" : "Planned work remained the largest allocation",
    denseMeetings ? "Meeting density consumed a material part of the week" : "Meetings stayed below the main risk threshold",
    fragmented ? "Frequent context switches reduced reliable delivery capacity" : "Deep-work windows were relatively protected"
  ];

  const headline = reactiveDominant
    ? "Reactive support is constraining delivery capacity."
    : "Planned work is moving, with manageable reactive load.";

  // `committed_utilization_pct` is an unbounded sum of penalties, so a busy week can land at or
  // past the ~80% utilization knee — and there `reliable_new_work_capacity_pct` clamps to 0. The
  // headroom copy must respect that boundary rather than always promising the week stays "near the
  // knee where reliability holds" (it doesn't — the user is over it). Branch both clauses on the
  // same threshold the clamp uses, mirroring the Weekly "Reliable new work" card's past/room
  // wording, and interpolate `TARGET_UTILIZATION_PCT` so the prose and the clamp can't drift.
  const overKnee = snapshot.committed_utilization_pct >= TARGET_UTILIZATION_PCT;
  const reliabilityClause = overKnee
    ? `reliable new-work capacity is estimated at ${snapshot.reliable_new_work_capacity_pct}% — already past the ~${TARGET_UTILIZATION_PCT}% utilization knee where delivery reliability degrades`
    : `reliable new-work capacity is estimated at ${snapshot.reliable_new_work_capacity_pct}% — enough to stay near the ~${TARGET_UTILIZATION_PCT}% utilization knee where delivery reliability holds`;
  const managerKneeClause = overKnee
    ? `putting total load past the ~${TARGET_UTILIZATION_PCT}% reliability knee, so new work should wait until committed load drops`
    : `keeping total load near the ~${TARGET_UTILIZATION_PCT}% reliability knee`;

  return {
    week_id: snapshot.week_id,
    headline,
    summary_text: `Estimated allocation reached ${snapshot.allocated_pct}% of a standard 40-hour week. Planned work accounted for ${snapshot.planned_pct}%, reactive work for ${snapshot.reactive_pct}%, and meetings for ${snapshot.meeting_pct}%. About ${snapshot.committed_utilization_pct}% of next week is already committed (recurring work, carryover, reactive load and fragmentation), so ${reliabilityClause}.`,
    key_drivers: topDrivers,
    manager_ready_summary: `This week appears to have ${snapshot.reliable_new_work_capacity_pct}% reliable capacity for new planned work next week, on top of roughly ${snapshot.committed_utilization_pct}% already committed — ${managerKneeClause}. The main constraints are reactive load, recurring commitments, carryover risk, and fragmentation. The estimate confidence is ${Math.round(snapshot.summary_confidence * 100)}%, and the user should review low-confidence blocks before sharing.`
  };
}
