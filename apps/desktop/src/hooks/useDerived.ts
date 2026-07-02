import { useMemo } from "react";
import { analyzeInterruptionLoad, buildForecastTrackRecord, computeCapacityBaselines, computeWeeklyCapacitySnapshot, generateWeeklyNarrative, scoreForecastAccuracy, summarizeChatStakeholders, summarizeForecastAccuracy } from "../../../../packages/inference/src/capacity";
import type { ChatStakeholderSummary, ForecastAccuracyTrend, ForecastTrackRecordEntry, InterruptionLoadAnalysis } from "../../../../packages/inference/src/capacity";
import { sessionizeActiveWindowSamples } from "../../../../packages/inference/src/sessionizer/activeWindow";
import { buildAccelerationSignals, buildRealizedSavings, summarizeRealizedSavings } from "../../../../packages/inference/src/accelerate";
import type { RealizedSavingsEntry, RealizedSavingsSummary } from "../../../../packages/inference/src/accelerate";
import type {
  WorkBlock,
  ActiveWindowSample,
  OutlookCalendarEvent,
  RawEvent,
  AccelerationSignal,
} from "../../../../packages/domain/src/models";
import type { PersistedNarrativeRecord, PersistedForecastRecord, PersistedSnapshotRecord, PersistedAccelerationSnapshot, ForecastAccuracyReview } from "../services/localStore";
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
  accelerationHistory: PersistedAccelerationSnapshot[];
  actedOnPlayIds: string[];
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
    accelerationHistory,
    actedOnPlayIds,
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
  const weekChatEvents = useMemo(
    () =>
      chatEvents.filter(
        (event) => getCurrentIsoWeekId(new Date(event.timestamp_start)) === currentWeekId
      ),
    [chatEvents, currentWeekId]
  );

  // This week's reviewed blocks — shared by the interruption analysis and the Acceleration miner
  // so neither re-filters the full ledger per render.
  const weekBlocks = useMemo(
    () => blocks.filter((block) => block.week_id === currentWeekId),
    [blocks, currentWeekId]
  );

  const interruptionLoad = useMemo<InterruptionLoadAnalysis | null>(
    () => analyzeInterruptionLoad(weekChatEvents, weekBlocks),
    [weekChatEvents, weekBlocks]
  );

  // Who the week's reactive chat work served — the collaboration view that pairs with the
  // interruption load. Same week-scoped, metadata-only chat events; null when no chat data.
  const chatStakeholders = useMemo<ChatStakeholderSummary | null>(
    () => summarizeChatStakeholders(weekChatEvents),
    [weekChatEvents]
  );

  // Rolling personal baselines from the weeks strictly before the current one, so the narrative's
  // "dense meetings" trigger can read against the user's own norm rather than an absolute cut
  // (mirrors the baseline machinery WeeklyCapacityScreen uses for its capacity chips).
  const capacityBaselines = useMemo(() => {
    const prior = snapshotHistory
      .filter((record) => record.week_id < currentWeekId)
      .map((record) => record.snapshot);
    return computeCapacityBaselines(prior);
  }, [snapshotHistory, currentWeekId]);

  const narrative = useMemo(
    () => generateWeeklyNarrative(snapshot, capacityBaselines),
    [snapshot, capacityBaselines]
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

  // Cross-week recurrence (E2): count how many PRIOR ISO weeks each signal_id was mined, from the
  // retained acceleration history. The current week is excluded (it's the week being ranked), so
  // this map is independent of the current mining and can't feed back into it. Emphasis only — it
  // nudges ranking and drives the card badge; the estimate stays deterministic.
  const recurrenceBySignalId = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const record of accelerationHistory) {
      if (record.week_id >= currentWeekId) continue;
      const seen = new Set<string>();
      for (const signal of record.signals) {
        if (seen.has(signal.signal_id)) continue; // one record per week, but guard duplicates
        seen.add(signal.signal_id);
        counts[signal.signal_id] = (counts[signal.signal_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [accelerationHistory, currentWeekId]);

  // Deterministic Acceleration signals — repetitive workflows, tool-able time-sinks,
  // context-switch hotspots, and (E4) a reactive-comms batching Play mined from this week's reviewed
  // blocks, captured sessions, and the chat interruption analysis, ranked by reclaimable time. No AI,
  // no network, always on (the D-tasks add the opt-in AI layer).
  const accelerationSignals = useMemo<AccelerationSignal[]>(
    () =>
      buildAccelerationSignals({
        blocks: weekBlocks,
        sessions: activeWindowSessions,
        recurrenceBySignalId,
        interruptionLoad,
      }),
    [weekBlocks, activeWindowSessions, recurrenceBySignalId, interruptionLoad]
  );

  // Realized-savings track record (E3): for every play the user marked acted-on, score its estimate
  // one retained week against the following week's — turning the engine's forward-looking estimates
  // into a proven record. Reads only the derived per-week summaries (id/type/minutes), so it's
  // privacy-trivial. Mirrors the forecast track-record pairing above.
  const realizedSavings = useMemo<RealizedSavingsEntry[]>(
    () =>
      buildRealizedSavings({
        history: accelerationHistory,
        actedOnSignalIds: actedOnPlayIds,
        currentWeekId,
      }),
    [accelerationHistory, actedOnPlayIds, currentWeekId]
  );

  const realizedSavingsSummary = useMemo<RealizedSavingsSummary | null>(
    () => summarizeRealizedSavings(realizedSavings),
    [realizedSavings]
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
    chatStakeholders,
    accelerationSignals,
    realizedSavings,
    realizedSavingsSummary,
  };
}
