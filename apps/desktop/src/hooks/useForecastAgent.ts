import { invoke } from "@tauri-apps/api/core";
import type {
  ActivitySession,
  AuditEvent,
  ForecastAgentResult,
  OutlookCalendarEvent,
  UserCorrection,
  WeeklyCapacitySnapshot,
  WorkBlock,
  AIConfig,
} from "../../../../packages/domain/src/models";
import { useAsyncStatus } from "./useAsyncStatus";
import { buildForecastAgentPrompt, FORECAST_AGENT_PROMPT_VERSION } from "../services/forecastAgentPrompt";
import { createAuditEvent } from "../lib/audit";
import { pct } from "../lib/format";
import type { PersistedForecastRecord } from "../services/localStore";

interface NativeForecastAgentResponse {
  forecast: ForecastAgentResult;
  model: string;
}

interface UseForecastAgentParams {
  isDemoMode: boolean;
  blocks: WorkBlock[];
  setGeneratedForecast: React.Dispatch<React.SetStateAction<PersistedForecastRecord | null>>;
  setForecastHistory: React.Dispatch<React.SetStateAction<PersistedForecastRecord[]>>;
  snapshot: WeeklyCapacitySnapshot;
  activeWindowSessions: ActivitySession[];
  currentWeekId: string;
  currentWeekRangeLabel: string;
  nextWeekId: string;
  nextWeekRangeLabel: string;
  calendarEvents: OutlookCalendarEvent[];
  corrections: UserCorrection[];
  aiConfig: AIConfig | null;
  setAuditEvents: React.Dispatch<React.SetStateAction<AuditEvent[]>>;
}

export function useForecastAgent({
  isDemoMode,
  blocks,
  setGeneratedForecast,
  setForecastHistory,
  snapshot,
  activeWindowSessions,
  currentWeekId,
  currentWeekRangeLabel,
  nextWeekId,
  nextWeekRangeLabel,
  calendarEvents,
  corrections,
  aiConfig,
  setAuditEvents,
}: UseForecastAgentParams) {
  const [forecastStatus, forecastError, forecastAsync] = useAsyncStatus<"idle" | "generating">("idle");

  async function generateForecastAgent() {
    if (isDemoMode) return;
    if (forecastStatus === "generating") return;

    if (blocks.length === 0) {
      forecastAsync.fail(
        "The Forecast Agent needs at least one work block before it can estimate next-week capacity."
      );
      return;
    }

    const startedAt = new Date().toISOString();
    const prompt = buildForecastAgentPrompt({
      currentWeekId,
      currentWeekRangeLabel,
      nextWeekId,
      nextWeekRangeLabel,
      snapshot,
      blocks,
      activeWindowSessions,
      calendarEvents,
      corrections,
    });

    forecastAsync.start("generating");

    try {
      const response = await invoke<NativeForecastAgentResponse>("generate_forecast_agent_with_openai", {
        request: { prompt, ai_config: aiConfig },
      });
      const record: PersistedForecastRecord = {
        forecast: response.forecast,
        generated_at: startedAt,
        generated_for_week: nextWeekId,
        trigger: "manual",
        model: response.model,
        prompt_version: FORECAST_AGENT_PROMPT_VERSION,
      };

      setGeneratedForecast(record);
      // Append to history so the forecast can be scored against actuals once its
      // target week arrives. Keep one record per target week (latest wins) and cap
      // the trail to the most recent 24 weeks.
      setForecastHistory((current) =>
        [...current.filter((entry) => entry.generated_for_week !== nextWeekId), record].slice(-24)
      );
      forecastAsync.setStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "forecast_agent",
          source: "openai_responses_api",
          title: "Next-week forecast generated",
          summary: `${pct(response.forecast.reliable_new_work_capacity_pct)} reliable new-work capacity forecast for ${nextWeekRangeLabel}`,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            current_week_id: currentWeekId,
            current_week_range: currentWeekRangeLabel,
            forecast_week_id: nextWeekId,
            forecast_week_range: nextWeekRangeLabel,
            model: response.model,
            prompt_version: FORECAST_AGENT_PROMPT_VERSION,
            work_block_count: blocks.length,
            active_window_session_count: activeWindowSessions.length,
            calendar_event_count: calendarEvents.length,
            correction_count: corrections.length,
            reliable_new_work_capacity_pct: response.forecast.reliable_new_work_capacity_pct,
            confidence: response.forecast.confidence,
            sent_to_openai: true,
            store: false,
          },
        }),
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      forecastAsync.fail(message);
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "forecast_agent",
          source: "openai_responses_api",
          title: "Forecast Agent failed",
          summary: message,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            current_week_id: currentWeekId,
            forecast_week_id: nextWeekId,
            prompt_version: FORECAST_AGENT_PROMPT_VERSION,
            work_block_count: blocks.length,
            sent_to_openai: true,
          },
        }),
      ].slice(-1000));
    }
  }

  return {
    forecastStatus,
    forecastError,
    generateForecastAgent,
    resetForecast: forecastAsync.reset,
  };
}
