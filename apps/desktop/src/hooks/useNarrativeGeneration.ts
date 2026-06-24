import { invoke } from "@tauri-apps/api/core";
import type {
  ActivitySession,
  AuditEvent,
  OutlookCalendarEvent,
  UserCorrection,
  VisualContextInsight,
  WorkBlock,
  WeeklyCapacitySnapshot,
  AIConfig,
} from "../../../../packages/domain/src/models";
import { useAsyncStatus } from "./useAsyncStatus";
import { buildWeeklyNarrativePrompt, NARRATIVE_PROMPT_VERSION } from "../services/narrativePrompt";
import type { generateWeeklyNarrative } from "../../../../packages/inference/src/capacity";
import { createAuditEvent } from "../lib/audit";
import { displaySafeNarrative, getLocalDateKey } from "../lib/date";
import type { PersistedNarrativeRecord } from "../services/localStore";

interface NativeNarrativeGenerationResponse {
  narrative: ReturnType<typeof generateWeeklyNarrative>;
  model: string;
}

interface UseNarrativeGenerationParams {
  isDemoMode: boolean;
  hasNarrativeEvidence: boolean;
  snapshot: WeeklyCapacitySnapshot;
  blocks: WorkBlock[];
  activeWindowSessions: ActivitySession[];
  calendarEvents: OutlookCalendarEvent[];
  visualContextInsights: VisualContextInsight[];
  corrections: UserCorrection[];
  currentWeekId: string;
  currentWeekRangeLabel: string;
  aiConfig: AIConfig | null;
  setGeneratedNarrative: React.Dispatch<React.SetStateAction<PersistedNarrativeRecord | null>>;
  setManagerSummaryText: React.Dispatch<React.SetStateAction<string | null>>;
  setAuditEvents: React.Dispatch<React.SetStateAction<AuditEvent[]>>;
}

export function useNarrativeGeneration({
  isDemoMode,
  hasNarrativeEvidence,
  snapshot,
  blocks,
  activeWindowSessions,
  calendarEvents,
  visualContextInsights,
  corrections,
  currentWeekId,
  currentWeekRangeLabel,
  aiConfig,
  setGeneratedNarrative,
  setManagerSummaryText,
  setAuditEvents,
}: UseNarrativeGenerationParams) {
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
      const response = await invoke<NativeNarrativeGenerationResponse>("generate_weekly_narrative_with_openai", {
        request: { prompt, ai_config: aiConfig },
      });
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

  return {
    narrativeGenerationStatus,
    narrativeGenerationError,
    regenerateNarrative,
    resetNarrative: narrativeAsync.reset,
  };
}
