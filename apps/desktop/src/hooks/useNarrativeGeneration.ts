import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAsyncStatus } from "./useAsyncStatus";
import { buildWeeklyNarrativePrompt, NARRATIVE_PROMPT_VERSION } from "../services/narrativePrompt";
import { displaySafeNarrative, getLocalDateKey } from "../lib/date";
import { createAuditEvent } from "../lib/audit";
import type {
  ActivitySession,
  AuditEvent,
  AIConfig,
  OutlookCalendarEvent,
  UserCorrection,
  VisualContextInsight,
  WeeklyCapacitySnapshot,
  WeeklyNarrative,
  WorkBlock,
} from "../../../../packages/domain/src/models";
import type { PersistedNarrativeRecord } from "../services/localStore";

interface NativeNarrativeGenerationResponse {
  narrative: WeeklyNarrative;
  model: string;
}

interface UseNarrativeGenerationParams {
  isDemoMode: boolean;
  blocks: WorkBlock[];
  snapshot: WeeklyCapacitySnapshot;
  activeWindowSessions: ActivitySession[];
  calendarEvents: OutlookCalendarEvent[];
  visualContextInsights: VisualContextInsight[];
  corrections: UserCorrection[];
  currentWeekId: string;
  currentWeekRangeLabel: string;
  aiConfig: AIConfig | null;
  hasNarrativeEvidence: boolean;
  lastNarrativeAutoRunDate: string | null;
  todayKey: string;
  setGeneratedNarrative: Dispatch<SetStateAction<PersistedNarrativeRecord | null>>;
  setManagerSummaryText: Dispatch<SetStateAction<string | null>>;
  setLastNarrativeAutoRunDate: Dispatch<SetStateAction<string | null>>;
  setAuditEvents: Dispatch<SetStateAction<AuditEvent[]>>;
}

export function useNarrativeGeneration(params: UseNarrativeGenerationParams) {
  const {
    isDemoMode,
    blocks,
    snapshot,
    activeWindowSessions,
    calendarEvents,
    visualContextInsights,
    corrections,
    currentWeekId,
    currentWeekRangeLabel,
    aiConfig,
    hasNarrativeEvidence,
    lastNarrativeAutoRunDate,
    todayKey,
    setGeneratedNarrative,
    setManagerSummaryText,
    setLastNarrativeAutoRunDate,
    setAuditEvents,
  } = params;

  const [narrativeGenerationStatus, narrativeGenerationError, narrativeAsync] =
    useAsyncStatus<"idle" | "generating">("idle");

  async function regenerateNarrative(trigger: "auto" | "manual") {
    if (isDemoMode) return;
    if (!hasNarrativeEvidence || narrativeGenerationStatus === "generating") return;

    const generatedAt = new Date().toISOString();
    const prompt = buildWeeklyNarrativePrompt({
      weekId: currentWeekId,
      weekRangeLabel: currentWeekRangeLabel,
      snapshot,
      blocks,
      activeWindowSessions,
      calendarEvents,
      visualContextInsights,
      corrections,
    });

    narrativeAsync.start("generating");

    try {
      const response = await invoke<NativeNarrativeGenerationResponse>(
        "generate_weekly_narrative_with_openai",
        { request: { prompt, ai_config: aiConfig } }
      );
      const sanitizedNarrative = displaySafeNarrative(response.narrative, currentWeekRangeLabel);
      const record: PersistedNarrativeRecord = {
        narrative: sanitizedNarrative,
        generated_at: generatedAt,
        generated_for_date: getLocalDateKey(new Date(generatedAt)),
        trigger,
        model: response.model,
        prompt_version: NARRATIVE_PROMPT_VERSION,
      };

      setGeneratedNarrative(record);
      setManagerSummaryText(null);
      narrativeAsync.setStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "narrative_generation",
          source: "openai_responses_api",
          title: trigger === "auto" ? "Daily narrative generated" : "Narrative regenerated manually",
          summary: `${response.model} generated a weekly narrative for ${currentWeekRangeLabel}`,
          privacy_level: "derived_only",
          timestamp: generatedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            model: response.model,
            trigger,
            prompt_version: NARRATIVE_PROMPT_VERSION,
            work_block_count: blocks.length,
            active_window_session_count: activeWindowSessions.length,
            calendar_event_count: calendarEvents.length,
            correction_count: corrections.length,
            sent_to_openai: true,
            store: false,
          },
        }),
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      narrativeAsync.fail(message);
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "narrative_generation",
          source: "openai_responses_api",
          title: "Narrative generation failed",
          summary: message,
          privacy_level: "derived_only",
          timestamp: generatedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            trigger,
            prompt_version: NARRATIVE_PROMPT_VERSION,
            sent_to_openai: true,
          },
        }),
      ].slice(-1000));
    }
  }

  // Auto-run once per day when evidence is available
  useEffect(() => {
    if (!hasNarrativeEvidence || lastNarrativeAutoRunDate === todayKey || narrativeGenerationStatus !== "idle") {
      return;
    }
    setLastNarrativeAutoRunDate(todayKey);
    void regenerateNarrative("auto");
  }, [hasNarrativeEvidence, lastNarrativeAutoRunDate, narrativeGenerationStatus, todayKey]);

  return {
    narrativeGenerationStatus,
    narrativeGenerationError,
    regenerateNarrative,
    resetNarrative: narrativeAsync.reset,
  };
}
