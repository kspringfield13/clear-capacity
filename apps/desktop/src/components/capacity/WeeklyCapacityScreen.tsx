import { useState, useMemo } from "react";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type { PersistedForecastRecord } from "../../services/localStore";
import type { WorkBlock } from "../../../../../packages/domain/src/models";
import { computeWeeklyCapacitySnapshot } from "../../../../../packages/inference/src/capacity";
import { categoryColors } from "../../../../../packages/domain/src/taxonomy";
import { pct } from "../../lib/format";
import { addDays, getCurrentIsoWeekId, getBusinessWeekRangeLabel } from "../../lib/date";
import { EmptyState } from "../common/EmptyState";
import { MetricCard } from "../common/MetricCard";
import { StackedBar } from "../common/StackedBar";
import { BarLine } from "../common/BarLine";
import { RiskRow } from "../common/RiskRow";
import { ForecastAgentPanel } from "./ForecastAgentPanel";

export function WeeklyCapacityScreen({
  snapshot: currentSnapshot,
  weekRangeLabel,
  nextWeekRangeLabel,
  generatedForecast,
  forecastStatus,
  forecastError,
  onGenerateForecast,
  hasWorkBlocks,
  blocks,
}: {
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  weekRangeLabel: string;
  nextWeekRangeLabel: string;
  generatedForecast: PersistedForecastRecord | null;
  forecastStatus: "idle" | "generating" | "error";
  forecastError: string | null;
  onGenerateForecast: () => void;
  hasWorkBlocks: boolean;
  blocks: WorkBlock[];
}) {
  const [weekOffset, setWeekOffset] = useState(0);

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

  if (!hasWorkBlocks) {
    return (
      <section className="screen capacity-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly capacity view</p>
            <h1>{weekRangeLabel}: waiting for real workload signal.</h1>
          </div>
          <div className="summary-score">
            <span>Summary confidence</span>
            <strong>--</strong>
          </div>
        </div>
        <EmptyState
          icon={BarChart3}
          title="No weekly capacity model yet."
          description="The percentage breakdown will stay blank until local sources create work blocks. Import Outlook calendar events now, then let active-window sessions become the next inference source."
        />
      </section>
    );
  }

  return (
    <section className="screen capacity-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Weekly capacity view</p>
          <div className="week-nav">
            <button
              className="week-nav-chevron"
              type="button"
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label="Previous week"
            >
              <ChevronLeft size={16} />
            </button>
            <h1>{viewedWeekRangeLabel}: {pct(snapshot.reliable_new_work_capacity_pct)} reliable capacity for new planned work.</h1>
            <button
              className="week-nav-chevron"
              type="button"
              disabled={isCurrentWeek}
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label="Next week"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="header-actions">
          <div className="summary-score">
            <span>Summary confidence</span>
            <strong>{Math.round(snapshot.summary_confidence * 100)}%</strong>
          </div>
        </div>
      </div>

      <div className="hero-metrics">
        <MetricCard label="Allocated capacity" value={snapshot.allocated_pct} helper="Estimated distribution this week" />
        <MetricCard label="Effective planned work" value={snapshot.planned_pct} helper="Capacity spent on planned work" />
        <MetricCard label="Reactive load" value={snapshot.reactive_pct} helper="Unplanned support and interruption work" />
        <MetricCard label="Reliable new work" value={snapshot.reliable_new_work_capacity_pct} helper="Forecast for next week" />
      </div>

      {isCurrentWeek && (
        <ForecastAgentPanel
          generatedForecast={generatedForecast}
          nextWeekRangeLabel={nextWeekRangeLabel}
          status={forecastStatus}
          error={forecastError}
          deterministicReliableCapacity={snapshot.reliable_new_work_capacity_pct}
          onGenerate={onGenerateForecast}
        />
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
        <StackedBar snapshot={snapshot} />
        <div className="allocation-grid">
          {snapshot.category_allocation.map((item) => (
            <div className="allocation-row" key={item.label}>
              <span className="dot" style={{ background: categoryColors[item.label] }} />
              <span>{item.label}</span>
              <strong>{pct(item.value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="two-column capacity-risk-grid">
        <section className="capacity-section">
          <div className="section-title">
            <h2>Planned vs reactive</h2>
            <span>politics-to-math translator</span>
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
            <RiskRow label="Context switch burden" value={snapshot.context_switch_score} />
            <RiskRow label="WIP overload" value={snapshot.wip_load_score} />
            <RiskRow label="Carryover risk" value={snapshot.carryover_risk_pct / 40} />
            <RiskRow label="Meeting density" value={snapshot.meeting_pct / 35} />
          </div>
        </section>
      </div>
    </section>
  );
}
