import { useMemo } from "react";
import { analyzeInterruptionLoad, buildForecastTrackRecord, computeWeeklyCapacitySnapshot, generateWeeklyNarrative, scoreForecastAccuracy, summarizeForecastAccuracy } from "../../../../packages/inference/src/capacity";
import type { ForecastAccuracyTrend, ForecastTrackRecordEntry, InterruptionLoadAnalysis } from "../../../../packages/inference/src/capacity";
import { sessionizeActiveWindowSamples } from "../../../../packages/inference/src/sessionizer/activeWindow";
import type {
  WorkBlock,
  ActiveWindowSample,
  OutlookCalendarEvent,
  RawEvent,
} from "../../../../packages/domain/src/models";
import type { PersistedNarrativeRecord, PersistedForecastRecord, PersistedSnapshotRecord, ForecastAccuracyReview } from "../services/localStore";
import { getCurrentIsoWeekId, getLocalDateKey, replaceIsoWeekIds } from "../lib/date";
import { pct } from "../lib/format";

interface UseDerivedParams {
  blocks: WorkBlock[];
  chatEvents: RawEvent[];
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
    chatEvents,
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

  // Pair every past forecast we can score with the capacity the model actually computed for the
  // week it targeted. Actuals come from the retained per-week snapshots, with the live snapshot
  // preferred for the current week. One scored entry per target week (latest forecast wins),
  // mirroring the single-week accuracy banner above. Feeds both the rolling trend and the
  // per-week track-record list.
  const scoredForecasts = useMemo(() => {
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

    return [...latestForecastByWeek.values()]
      .filter((entry) => actualByWeek.has(entry.generated_for_week))
      .map((entry) => ({
        week_id: entry.generated_for_week,
        predicted_pct: entry.forecast.reliable_new_work_capacity_pct,
        actual_pct: actualByWeek.get(entry.generated_for_week) as number,
      }));
  }, [forecastHistory, snapshotHistory, currentWeekId, snapshot.reliable_new_work_capacity_pct]);

  // Roll the scored forecasts into a single mean-absolute-error so the latest forecast can be
  // read against the model's own track record.
  const forecastAccuracyTrend = useMemo<ForecastAccuracyTrend | null>(
    () => summarizeForecastAccuracy(scoredForecasts),
    [scoredForecasts]
  );

  // Per-week predicted-vs-actual list (newest first) so the model can be audited over time.
  const forecastTrackRecord = useMemo<ForecastTrackRecordEntry[]>(
    () => buildForecastTrackRecord(scoredForecasts),
    [scoredForecasts]
  );

  // Chat-driven interruption load (null when no chat data) — explains the context-switch story
  // with the reactive density calendar + git can't see. Metadata-only inputs. Scoped to the
  // current ISO week so the panel (which renders only on the current week) describes *this*
  // week's chat load, not accumulated lifetime totals.
  const interruptionLoad = useMemo<InterruptionLoadAnalysis | null>(() => {
    const weekChatEvents = chatEvents.filter(
      (event) => getCurrentIsoWeekId(new Date(event.timestamp_start)) === currentWeekId
    );
    const weekBlocks = blocks.filter((block) => block.week_id === currentWeekId);
    return analyzeInterruptionLoad(weekChatEvents, weekBlocks);
  }, [chatEvents, blocks, currentWeekId]);

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
    forecastTrackRecord,
    interruptionLoad,
  };
}
