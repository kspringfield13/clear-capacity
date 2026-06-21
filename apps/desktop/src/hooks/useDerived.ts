import { useMemo } from "react";
import { computeWeeklyCapacitySnapshot, generateWeeklyNarrative } from "../../../../packages/inference/src/capacity";
import { sessionizeActiveWindowSamples } from "../../../../packages/inference/src/sessionizer/activeWindow";
import type {
  WorkBlock,
  ActiveWindowSample,
  OutlookCalendarEvent,
} from "../../../../packages/domain/src/models";
import type { PersistedNarrativeRecord, PersistedForecastRecord } from "../services/localStore";
import { getLocalDateKey, replaceIsoWeekIds } from "../lib/date";
import { pct } from "../lib/format";

interface UseDerivedParams {
  blocks: WorkBlock[];
  activeWindowSamples: ActiveWindowSample[];
  calendarEvents: OutlookCalendarEvent[];
  generatedNarrative: PersistedNarrativeRecord | null;
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
    managerSummaryText,
    currentWeekId,
    currentWeekRangeLabel,
    nextWeekRangeLabel,
  } = params;

  const snapshot = useMemo(
    () => computeWeeklyCapacitySnapshot(currentWeekId, blocks),
    [blocks, currentWeekId]
  );

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
  };
}
