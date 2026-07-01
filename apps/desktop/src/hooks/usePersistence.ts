import { useEffect } from "react";
import { writePersistedState } from "../services/localStore";
import type {
  WorkBlock,
  OutlookCalendarEvent,
  RawEvent,
  ActiveWindowSample,
  AuditEvent,
  UserCorrection,
  ReviewCopilotSuggestion,
  SavedSkill,
  VisualContextInsight,
  AIConfig
} from "../../../../packages/domain/src/models";
import type { PersistedAccelerationRecord, PersistedForecastRecord, PersistedNarrativeRecord, PersistedSnapshotRecord } from "../services/localStore";
import type { ProactiveAlertRuntime, ProactiveAlertSettings } from "../lib/proactiveAlerts";

interface PersistableState {
  blocks: WorkBlock[];
  calendarEvents: OutlookCalendarEvent[];
  chatEvents: RawEvent[];
  activeWindowSamples: ActiveWindowSample[];
  auditEvents: AuditEvent[];
  corrections: UserCorrection[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  generatedForecast: PersistedForecastRecord | null;
  forecastHistory: PersistedForecastRecord[];
  snapshotHistory: PersistedSnapshotRecord[];
  visualContextEnabled: boolean;
  visualContextInsights: VisualContextInsight[];
  dismissedPlayIds: string[];
  savedPlayIds: string[];
  generatedPlays: PersistedAccelerationRecord | null;
  savedSkills: SavedSkill[];
  managerSummaryText: string | null;
  generatedNarrative: PersistedNarrativeRecord | null;
  lastNarrativeAutoRunDate: string | null;
  paused: boolean;
  aiConfig: AIConfig | null;
  retentionDays: number | null;
  onboardingDismissed: boolean;
  walkthroughCompleted: boolean;
  proactiveAlertSettings: ProactiveAlertSettings;
  proactiveAlertRuntime: ProactiveAlertRuntime;
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
    persistData.chatEvents,
    persistData.activeWindowSamples,
    persistData.auditEvents,
    persistData.corrections,
    persistData.reviewSuggestions,
    persistData.generatedForecast,
    persistData.forecastHistory,
    persistData.snapshotHistory,
    persistData.visualContextEnabled,
    persistData.visualContextInsights,
    persistData.dismissedPlayIds,
    persistData.savedPlayIds,
    persistData.generatedPlays,
    persistData.savedSkills,
    persistData.managerSummaryText,
    persistData.generatedNarrative,
    persistData.lastNarrativeAutoRunDate,
    persistData.paused,
    persistData.aiConfig,
    persistData.retentionDays,
    persistData.onboardingDismissed,
    persistData.walkthroughCompleted,
    persistData.proactiveAlertSettings,
    persistData.proactiveAlertRuntime,
    isDemoMode,
  ]);
}
