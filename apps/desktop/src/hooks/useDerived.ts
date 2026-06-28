import { useMemo } from "react";
import { computeWeeklyCapacitySnapshot, generateWeeklyNarrative, scoreForecastAccuracy, summarizeForecastAccuracy } from "../../../../packages/inference/src/capacity";
import type { ForecastAccuracyTrend } from "../../../../packages/inference/src/capacity";
import { sessionizeActiveWindowSamples } from "../../../../packages/inference/src/sessionizer/activeWindow";
import type {
  WorkBlock,
  ActiveWindowSample,
  OutlookCalendarEvent,
} from "../../../../packages/domain/src/models";
import type { PersistedNarrativeRecord, PersistedForecastRecord, PersistedSnapshotRecord, ForecastAccuracyReview } from "../services/localStore";
import { getLocalDateKey, replaceIsoWeekIds } from "../lib/date";
import { pct } from "../lib/format";

interface UseDerivedParams {
  blocks: WorkBlock[];
  activeWindowSamples: ActiveWindowSample[];
  calendarEvents: OutlookCalendarEvent[];
  generatedNarrative: PersistedNarrativeRecord | null;
  forecastHistory: PersistedForecastRecord[];
  snapshotHistory: PersistedSnapshotRecord[];
  managerSummaryText: string | null;
  currentWeekId: string;
  currentWeekRangeLabel: string;
  nextWeekRangeLabel: string;
}

export function useDerived(params: UseDerivedParams) {
  const {
    blocks,
    activeWindowSamples,
    calendarEvents,
    generatedNarrative,
    forecastHistory,
    snapshotHistory,
    managerSummaryText,
    currentWeekId,
    currentWeekRangeLabel,
    nextWeekRangeLabel,
  } = params;

  const snapshot = useMemo(
    () => computeWeeklyCapacitySnapshot(currentWeekId, blocks),
    [blocks, currentWeekId]
  );

  // If a forecast made in a prior week targeted the now-current week, score its
  // predicted reliable capacity against what the model actually computed.
  const forecastAccuracy = useMemo<ForecastAccuracyReview | null>(() => {
    const matching = forecastHistory
      .filter((entry) => entry.generated_for_week === currentWeekId)
      .sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0];
    if (!matching) return null;
    return {
      record: matching,
      ...scoreForecastAccuracy(
        matching.forecast.reliable_new_work_capacity_pct,
        snapshot.reliable_new_work_capacity_pct
      ),
    };
  }, [forecastHistory, currentWeekId, snapshot.reliable_new_work_capacity_pct]);

  // Aggregate every past forecast we can score (predicted vs the capacity the model actually
  // computed for that week) into a rolling mean-absolute-error, so the latest forecast can be
  // read against the model's own track record. Actuals come from the retained per-week snapshots,
  // with the live snapshot preferred for the current week. One scored entry per target week
  // (latest forecast wins), mirroring the single-week accuracy banner above.
  const forecastAccuracyTrend = useMemo<ForecastAccuracyTrend | null>(() => {
    const actualByWeek = new Map<string, number>();
    for (const record of snapshotHistory) {
      actualByWeek.set(record.week_id, record.snapshot.reliable_new_work_capacity_pct);
    }
    actualByWeek.set(currentWeekId, snapshot.reliable_new_work_capacity_pct);

    const latestForecastByWeek = new Map<string, PersistedForecastRecord>();
    for (const entry of forecastHistory) {
      const existing = latestForecastByWeek.get(entry.generated_for_week);
      if (!existing || entry.generated_at.localeCompare(existing.generated_at) > 0) {
        latestForecastByWeek.set(entry.generated_for_week, entry);
      }
    }

    const scored = [...latestForecastByWeek.values()]
      .filter((entry) => actualByWeek.has(entry.generated_for_week))
      .map((entry) => ({
        week_id: entry.generated_for_week,
        predicted_pct: entry.forecast.reliable_new_work_capacity_pct,
        actual_pct: actualByWeek.get(entry.generated_for_week) as number,
      }));

    return summarizeForecastAccuracy(scored);
  }, [forecastHistory, snapshotHistory, currentWeekId, snapshot.reliable_new_work_capacity_pct]);

  const narrative = useMemo(
    () => generateWeeklyNarrative(snapshot),
    [snapshot]
  );

  const managerText = generatedNarrative
    ? replaceIsoWeekIds(
        managerSummaryText ?? `${generatedNarrative.narrative.headline}\n\n${generatedNarrative.narrative.manager_ready_summary}`,
        currentWeekRangeLabel
      )
    : "";

  const activeWindowSessions = useMemo(
    () => sessionizeActiveWindowSamples(activeWindowSamples),
    [activeWindowSamples]
  );

  const hasNarrativeEvidence =
    blocks.length > 0 || activeWindowSessions.length > 0 || calendarEvents.length > 0;

  const todayKey = useMemo(() => getLocalDateKey(), []);

  const reviewQueue = useMemo(
    () => blocks.filter((block) => !block.user_verified),
    [blocks]
  );

  const toolbarStatus = useMemo(() => {
    return blocks.length > 0
      ? `${pct(snapshot.reliable_new_work_capacity_pct)} reliable new-work capacity`
      : `${activeWindowSessions.length} sessions, ${calendarEvents.length} Outlook events`;
  }, [blocks.length, snapshot.reliable_new_work_capacity_pct, activeWindowSessions.length, calendarEvents.length]);

  return {
    snapshot,
    narrative,
    managerText,
    activeWindowSessions,
    hasNarrativeEvidence,
    todayKey,
    reviewQueue,
    toolbarStatus,
    forecastAccuracy,
    forecastAccuracyTrend,
  };
}
