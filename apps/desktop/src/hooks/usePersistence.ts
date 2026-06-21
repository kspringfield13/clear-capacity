import { useEffect } from "react";
import { writePersistedState } from "../services/localStore";
import type {
  WorkBlock,
  OutlookCalendarEvent,
  ActiveWindowSample,
  AuditEvent,
  UserCorrection,
  ReviewCopilotSuggestion,
  VisualContextInsight,
  AIConfig
} from "../../../../packages/domain/src/models";
import type { PersistedForecastRecord, PersistedNarrativeRecord } from "../services/localStore";

interface PersistableState {
  blocks: WorkBlock[];
  calendarEvents: OutlookCalendarEvent[];
  activeWindowSamples: ActiveWindowSample[];
  auditEvents: AuditEvent[];
  corrections: UserCorrection[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  generatedForecast: PersistedForecastRecord | null;
  visualContextEnabled: boolean;
  visualContextInsights: VisualContextInsight[];
  managerSummaryText: string | null;
  generatedNarrative: PersistedNarrativeRecord | null;
  lastNarrativeAutoRunDate: string | null;
  paused: boolean;
  aiConfig: AIConfig | null;
  isDemoMode: boolean;
}

export function usePersistence(state: PersistableState) {
  const { isDemoMode, ...persistData } = state;

  useEffect(() => {
    if (isDemoMode) return;
    writePersistedState({
      version: 1,
      ...persistData,
    } as any).catch(() => {}); // aiConfig added
  }, [
    persistData.blocks,
    persistData.calendarEvents,
    persistData.activeWindowSamples,
    persistData.auditEvents,
    persistData.corrections,
    persistData.reviewSuggestions,
    persistData.generatedForecast,
    persistData.visualContextEnabled,
    persistData.visualContextInsights,
    persistData.managerSummaryText,
    persistData.generatedNarrative,
    persistData.lastNarrativeAutoRunDate,
    persistData.paused,
    persistData.aiConfig,
    isDemoMode,
  ]);
}
