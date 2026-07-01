import { useState, useMemo } from "react";
import { ArrowDown, ArrowUp, BarChart3, ChevronLeft, ChevronRight, Minus, Upload, Zap } from "lucide-react";
import type { WorkBlock } from "../../../../../packages/domain/src/models";
import type { Screen } from "../../lib/types";
import type { PersistedSnapshotRecord } from "../../services/localStore";
import { computeWeeklyCapacitySnapshot, computeCapacityBaselines } from "../../../../../packages/inference/src/capacity";
import type { ChatStakeholderSummary, InterruptionLoadAnalysis } from "../../../../../packages/inference/src/capacity";
import { categoryColors } from "../../../../../packages/domain/src/taxonomy";
import { pct, formatHourOfDay } from "../../lib/format";
import { addDays, getCurrentIsoWeekId, getBusinessWeekRangeLabel } from "../../lib/date";
import { EmptyState } from "../common/EmptyState";
import { OnboardingCard, type OnboardingStep } from "../common/OnboardingCard";
import { MetricCard } from "../common/MetricCard";
import { StackedBar } from "../common/StackedBar";
import { BarLine } from "../common/BarLine";
import { RiskRow } from "../common/RiskRow";

// The M/M/1 ~80% utilization "knee" the target-utilization model targets — mirrors
// TARGET_UTILIZATION_PCT in packages/inference/src/capacity.ts. Drives the conditional
// "Reliable new work" helper copy so it never claims headroom the model has clamped to 0.
const RELIABILITY_KNEE_PCT = 80;

// The headline metrics shown against the user's own rolling baseline. `scale` lifts the
// 0–1 context-switch index onto the same /100 scale the RiskRow uses so its delta reads
// in points like the percentages; `betterWhen` only drives the chip's color/arrow tone.
const BASELINE_METRICS: Array<{
  key: "reliable_new_work_capacity_pct" | "reactive_pct" | "meeting_pct" | "context_switch_score";
  label: string;
  scale: number;
  betterWhen: "higher" | "lower";
}> = [
  { key: "reliable_new_work_capacity_pct", label: "Reliable capacity", scale: 1, betterWhen: "higher" },
  { key: "reactive_pct", label: "Reactive load", scale: 1, betterWhen: "lower" },
  { key: "meeting_pct", label: "Meeting density", scale: 1, betterWhen: "lower" },
  { key: "context_switch_score", label: "Context switching", scale: 100, betterWhen: "lower" },
];

export function WeeklyCapacityScreen({
  snapshot: currentSnapshot,
  snapshotHistory,
  interruptionLoad,
  chatStakeholders,
  weekRangeLabel,
  hasWorkBlocks,
  blocks,
  onboardingSteps,
  showOnboarding,
  onDismissOnboarding,
  onOpenScreen,
}: {
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  snapshotHistory: PersistedSnapshotRecord[];
  interruptionLoad: InterruptionLoadAnalysis | null;
  chatStakeholders: ChatStakeholderSummary | null;
  weekRangeLabel: string;
  hasWorkBlocks: boolean;
  blocks: WorkBlock[];
  onboardingSteps: OnboardingStep[];
  showOnboarding: boolean;
  onDismissOnboarding: () => void;
  onOpenScreen: (screen: Screen) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const viewedMonday = useMemo(() => {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() + 1 - day);
    monday.setHours(0, 0, 0, 0);
    return addDays(monday, weekOffset * 7);
  }, [weekOffset]);

  const viewedWeekId = useMemo(() => getCurrentIsoWeekId(viewedMonday), [viewedMonday]);
  const viewedWeekRangeLabel = useMemo(() => getBusinessWeekRangeLabel(viewedMonday), [viewedMonday]);

  const viewedBlocks = useMemo(() => {
    if (weekOffset === 0) return blocks;
    const start = viewedMonday.getTime();
    const end = addDays(viewedMonday, 7).getTime();
    return blocks.filter((b) => {
      const t = new Date(b.start_time).getTime();
      return t >= start && t < end;
    });
  }, [blocks, weekOffset, viewedMonday]);

  const snapshot = useMemo(
    () => (weekOffset === 0 ? currentSnapshot : computeWeeklyCapacitySnapshot(viewedWeekId, viewedBlocks)),
    [currentSnapshot, weekOffset, viewedWeekId, viewedBlocks]
  );

  const isCurrentWeek = weekOffset === 0;
  const blockerCount = useMemo(() => viewedBlocks.filter((b) => b.blocker_flag).length, [viewedBlocks]);
  const unallocatedPct = useMemo(() => {
    const total = snapshot.category_allocation.reduce((acc, item) => acc + item.value, 0);
    return Math.max(0, 100 - total);
  }, [snapshot]);

  // Reliable-new-work helper: when committed utilization is already at/over the knee, the model
  // clamps reliable headroom to 0, so "room to the 80% knee" would contradict the 0% value shown.
  const reliableHelper =
    snapshot.committed_utilization_pct >= RELIABILITY_KNEE_PCT
      ? `${pct(snapshot.committed_utilization_pct)} already committed · past the ${RELIABILITY_KNEE_PCT}% knee`
      : `${pct(snapshot.committed_utilization_pct)} already committed · room to the ${RELIABILITY_KNEE_PCT}% knee`;

  // Rolling personal baselines from the weeks strictly before the one in view, so each
  // headline number reads against the user's own norm rather than an absolute scale.
  const baselines = useMemo(() => {
    const prior = snapshotHistory
      .filter((record) => record.week_id < snapshot.week_id)
      .map((record) => record.snapshot);
    return computeCapacityBaselines(prior);
  }, [snapshotHistory, snapshot.week_id]);

  const baselineChips = useMemo(() => {
    if (baselines.week_count < 2) return [];
    return BASELINE_METRICS.flatMap((metric) => {
      const baseline = baselines[metric.key];
      if (baseline === null) return [];
      const current = Math.round(snapshot[metric.key] * metric.scale);
      const median = Math.round(baseline * metric.scale);
      const delta = current - median;
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      const tone =
        delta === 0
          ? "flat"
          : (delta > 0) === (metric.betterWhen === "higher")
            ? "good"
            : "bad";
      return [{ ...metric, current, median, delta, direction, tone }];
    });
  }, [baselines, snapshot]);

  if (!hasWorkBlocks) {
    return (
      <section className="screen capacity-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly capacity view</p>
            <div className="headline-with-score">
              <h1>{weekRangeLabel}: waiting for real workload signal.</h1>
              <div className="summary-score" title="How confident the model is in this week's capacity estimate">
                <span>Summary confidence</span>
                <strong>--</strong>
                <span className="sr-only">How confident the model is in this week's capacity estimate</span>
              </div>
            </div>
          </div>
        </div>
        {showOnboarding && (
          <OnboardingCard steps={onboardingSteps} onDismiss={onDismissOnboarding} />
        )}
        <EmptyState
          icon={BarChart3}
          title="No weekly capacity model yet."
          description="The percentage breakdown will stay blank until local sources create work blocks. Import Outlook calendar events now, then let active-window sessions become the next inference source."
        >
          <button className="primary-action" type="button" onClick={() => onOpenScreen("setup")}>
            <Upload size={16} />
            <span>Import calendar</span>
          </button>
          <button className="secondary-action" type="button" onClick={() => onOpenScreen("setup")}>
            <span>Open Settings</span>
          </button>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="screen capacity-screen">
      <div className="screen-header">
        <div>
          <div className="week-nav">
            <p className="eyebrow">Weekly capacity view</p>
            <div className="week-nav-controls">
              <button
                className="week-nav-chevron"
                type="button"
                onClick={() => setWeekOffset((o) => o - 1)}
                aria-label="Previous week"
                title="Previous week"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="week-nav-chevron"
                type="button"
                disabled={isCurrentWeek}
                onClick={() => setWeekOffset((o) => o + 1)}
                aria-label={isCurrentWeek ? "Cannot navigate past current week" : "Next week"}
                title={isCurrentWeek ? "Cannot navigate past current week" : "Next week"}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="headline-with-score">
            <h1>{viewedWeekRangeLabel}: {pct(snapshot.reliable_new_work_capacity_pct)} reliable capacity for new planned work.</h1>
            <div className="summary-score" title="How confident the model is in this week's capacity estimate">
              <span>Summary confidence</span>
              <strong>{Math.round(snapshot.summary_confidence * 100)}%</strong>
              <span className="sr-only">How confident the model is in this week's capacity estimate</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-metrics">
        <MetricCard label="Allocated capacity" value={snapshot.allocated_pct} helper="Estimated distribution this week" />
        <MetricCard label="Effective planned work" value={snapshot.planned_pct} helper="Capacity spent on planned work" />
        <MetricCard label="Reactive load" value={snapshot.reactive_pct} helper="Unplanned support and interruption work" />
        <MetricCard label="Reliable new work" value={snapshot.reliable_new_work_capacity_pct} helper={reliableHelper} showRing title="Past ~80% utilization, delays grow sharply — we hold back the last ~20% as buffer" />
      </div>

      {baselineChips.length > 0 && (isCurrentWeek || viewedBlocks.length > 0) && (
        <section className="baseline-chips" aria-label={`Selected week versus your ${baselines.week_count}-week baseline`}>
          <span className="baseline-chips-label">vs your {baselines.week_count}-wk median</span>
          <div className="baseline-chip-row">
            {baselineChips.map((chip) => {
              const Icon = chip.direction === "up" ? ArrowUp : chip.direction === "down" ? ArrowDown : Minus;
              const signed = `${chip.delta > 0 ? "+" : ""}${chip.delta}`;
              return (
                <span
                  key={chip.key}
                  className="baseline-chip"
                  data-tone={chip.tone}
                  title={`${chip.label}: ${chip.current} this week vs your ${baselines.week_count}-week median of ${chip.median}`}
                >
                  <span className="baseline-chip-metric">{chip.label}</span>
                  <span className="baseline-chip-delta">
                    <Icon size={12} aria-hidden />
                    {chip.direction === "flat" ? "0" : signed}
                  </span>
                  <span className="sr-only">
                    {chip.direction === "flat"
                      ? `matches your ${baselines.week_count}-week median of ${chip.median}`
                      : `${Math.abs(chip.delta)} ${chip.direction === "up" ? "above" : "below"} your ${baselines.week_count}-week median of ${chip.median}`}
                  </span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      {!isCurrentWeek && viewedBlocks.length === 0 && (
        <EmptyState
          icon={BarChart3}
          title={`No work blocks for ${viewedWeekRangeLabel}.`}
          description="Work blocks are tagged to the week they were classified. Earlier weeks will show data if Outlook imports or classifications were run during that week."
        />
      )}

      <section className="capacity-section capacity-model">
        <div className="section-title">
          <h2>100% weekly capacity model</h2>
          <span>standard 40-hour baseline</span>
        </div>
        <StackedBar snapshot={snapshot} hoveredCategory={hoveredCategory} onHoverCategory={setHoveredCategory} />
        <div className="allocation-grid">
          {snapshot.category_allocation.map((item) => (
            <div
              className="allocation-row"
              key={item.label}
              title={item.label}
              style={{ opacity: hoveredCategory && hoveredCategory !== item.label ? 0.35 : 1, transition: "opacity 0.12s" }}
              onMouseEnter={() => setHoveredCategory(item.label)}
              onMouseLeave={() => setHoveredCategory(null)}
            >
              <span className="dot" style={{ background: categoryColors[item.label] }} />
              <span>{item.label}</span>
              <strong>{pct(item.value)}</strong>
            </div>
          ))}
          {unallocatedPct > 0 && (
            <div
              className="allocation-row"
              title="Hours not yet assigned to a category"
              style={{ opacity: hoveredCategory ? 0.35 : 1, transition: "opacity 0.12s" }}
            >
              <span className="dot" style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)" }} />
              <span>Unallocated / buffer</span>
              <strong>{pct(unallocatedPct)}</strong>
            </div>
          )}
        </div>
      </section>

      <div className="two-column capacity-risk-grid">
        <section className="capacity-section">
          <div className="section-title">
            <h2>Planned vs reactive</h2>
            <span>where your hours actually went</span>
          </div>
          <div className="comparison-bars">
            <BarLine label="Planned" value={snapshot.planned_pct} tone="blue" />
            <BarLine label="Reactive" value={snapshot.reactive_pct} tone="red" />
            <BarLine label="Fixed / recurring" value={snapshot.recurring_pct} tone="teal" />
            <BarLine label="Blocked" value={snapshot.blocked_pct} tone="purple" />
          </div>
        </section>
        <section className="capacity-section">
          <div className="section-title">
            <h2>Delivery risk modifiers</h2>
            <span>forecast inputs</span>
          </div>
          <div className="risk-list">
            <RiskRow
              label="Context switch burden"
              value={snapshot.context_switch_score}
              tooltip="Task-switching cost index: 0 = minimal, 100 = very high burden"
              hint="/100"
            />
            <RiskRow
              label="WIP overload"
              value={snapshot.wip_load_score}
              tooltip="Parallel work-in-progress pressure: 0 = manageable, 100 = critical"
              hint="/100"
            />
            <RiskRow
              label="Carryover risk"
              value={snapshot.carryover_risk_pct / 40}
              tooltip="Likelihood of blocks spilling into next week: 0 = low, 100 = high"
              hint="/100"
            />
            <RiskRow
              label="Meeting density"
              value={snapshot.meeting_pct / 35}
              tooltip="Meeting load relative to capacity: 0 = light, 100 = saturated"
              hint="/100"
            />
            <RiskRow
              label="Active blockers"
              value={Math.min(blockerCount / 5, 1)}
              displayValue={blockerCount}
              tooltip="Number of work blocks flagged as a blocker this week"
              dangerActive={blockerCount > 0}
            />
          </div>
        </section>
      </div>

      {isCurrentWeek && interruptionLoad && (
        <section className="interruption-note" aria-label="Chat interruption load">
          <div className="interruption-header">
            <Zap size={16} aria-hidden className="interruption-icon" />
            <div>
              <strong>Chat interruption load</strong>
              <p>
                Workplace chat is the reactive signal calendar and git can't see. These
                metadata-only counts (no message text) show how much it fragmented your focus —
                feeding the context-switch burden above.
              </p>
            </div>
          </div>
          <ul className="interruption-stats">
            <li
              className="interruption-stat"
              title="A reactive burst is a cluster of chat messages within ~20 minutes — counted once per imported chat session"
            >
              <strong>{interruptionLoad.burst_count}</strong>
              <span>reactive {interruptionLoad.burst_count === 1 ? "burst" : "bursts"}</span>
              <span className="sr-only">
                A reactive burst is a cluster of chat messages within about 20 minutes.
              </span>
            </li>
            <li
              className="interruption-stat"
              title="Messages per hour spent in chat bursts this week — interruption intensity while engaged"
            >
              <strong>{interruptionLoad.messages_per_active_hour}/hr</strong>
              <span>messages while active</span>
              <span className="sr-only">
                Messages per hour spent in chat bursts — interruption intensity while engaged.
              </span>
            </li>
            <li
              className="interruption-stat"
              title={
                interruptionLoad.mention_pct > 0
                  ? `${interruptionLoad.mention_count} of ${interruptionLoad.message_count} messages @-mentioned you directly (${interruptionLoad.mention_pct}%) — the sharpest interruption signal`
                  : "Messages that @-mentioned you directly — the sharpest interruption signal"
              }
            >
              <strong>{interruptionLoad.mention_count}</strong>
              <span>direct @-mentions</span>
              <span className="sr-only">
                {interruptionLoad.mention_pct > 0
                  ? `${interruptionLoad.mention_pct}% of this week's ${interruptionLoad.message_count} reactive messages pulled you in by name — the sharpest interruption signal, hardest to batch or defer.`
                  : "Messages that pulled you in by name — the sharpest interruption signal."}
              </span>
            </li>
            <li
              className="interruption-stat"
              title={`${interruptionLoad.interrupted_deep_work_count} of ${interruptionLoad.deep_work_block_count} deep-work blocks overlapped a chat burst`}
            >
              <strong>{interruptionLoad.interrupted_deep_work_pct}%</strong>
              <span>deep work interrupted</span>
              <span className="sr-only">
                {interruptionLoad.interrupted_deep_work_count} of {interruptionLoad.deep_work_block_count} deep-work blocks overlapped a chat burst.
              </span>
            </li>
          </ul>
          {interruptionLoad.peak_day && interruptionLoad.active_day_count >= 2 && (
            <p className="interruption-peak-note">
              Reactive load peaked on <strong>{interruptionLoad.peak_day}</strong>
              {interruptionLoad.peak_hour !== null && (
                <> around <strong>{formatHourOfDay(interruptionLoad.peak_hour)}</strong></>
              )}{" "}
              —{" "}
              {interruptionLoad.peak_day_message_count}{" "}
              {interruptionLoad.peak_day_message_count === 1 ? "message" : "messages"} across{" "}
              {interruptionLoad.active_day_count} active days.{" "}
              {interruptionLoad.calm_day && interruptionLoad.calm_day !== interruptionLoad.peak_day ? (
                <>
                  Your quietest active day was <strong>{interruptionLoad.calm_day}</strong> —
                  consider protecting it for deep work.
                </>
              ) : (
                "Consider protecting the quieter days for deep work."
              )}
            </p>
          )}
          {interruptionLoad.after_hours_message_count > 0 && (
            <p className="interruption-peak-note">
              <strong>{interruptionLoad.after_hours_pct}%</strong> of reactive messages
              ({interruptionLoad.after_hours_message_count} of {interruptionLoad.message_count})
              arrived outside core hours (8am–6pm) — chat bleeding into personal time.
            </p>
          )}
        </section>
      )}

      {isCurrentWeek && chatStakeholders && chatStakeholders.groups.length > 0 && (
        <section
          className="baseline-chips stakeholder-chips"
          aria-label="Who your reactive chat time served this week"
        >
          <span className="baseline-chips-label">Who your reactive time served</span>
          <div className="baseline-chip-row">
            {chatStakeholders.groups.map((group) => (
              <span
                key={group.label}
                className="baseline-chip"
                title={`${group.label}: ${group.share_pct}% of this week's reactive chat volume, across ${group.burst_count} ${group.burst_count === 1 ? "burst" : "bursts"}`}
              >
                <span className="baseline-chip-metric">{group.label}</span>
                <span className="baseline-chip-delta">{group.share_pct}%</span>
                <span className="sr-only">
                  {group.share_pct}% of this week's reactive chat volume, across {group.burst_count} {group.burst_count === 1 ? "burst" : "bursts"}
                </span>
              </span>
            ))}
          </div>
          {chatStakeholders.group_count > chatStakeholders.groups.length && (
            <span className="stakeholder-chips-note">
              Top {chatStakeholders.groups.length} of {chatStakeholders.group_count} groups by reactive
              volume — {chatStakeholders.group_count - chatStakeholders.groups.length} more not shown.
            </span>
          )}
        </section>
      )}
    </section>
  );
}
