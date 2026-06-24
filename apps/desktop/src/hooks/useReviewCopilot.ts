import { invoke } from "@tauri-apps/api/core";
import type {
  ActivitySession,
  AuditEvent,
  OutlookCalendarEvent,
  PlannedStatus,
  ReviewCopilotAction,
  ReviewCopilotSuggestion,
  UserCorrection,
  WeeklyCapacitySnapshot,
  WorkBlock,
  WorkCategory,
  WorkMode,
  AIConfig,
} from "../../../../packages/domain/src/models";
import { useAsyncStatus } from "./useAsyncStatus";
import { buildReviewCopilotPrompt, REVIEW_COPILOT_PROMPT_VERSION } from "../services/reviewCopilotPrompt";
import { createAuditEvent } from "../lib/audit";
import { stableHash } from "../lib/blocks";

interface NativeReviewCopilotSuggestion {
  action: ReviewCopilotAction;
  work_block_ids: string[];
  title: string;
  rationale: string;
  confidence: number;
  proposed_category: WorkCategory | null;
  proposed_mode: WorkMode | null;
  proposed_planned_status: PlannedStatus | null;
  proposed_project_name: string | null;
  proposed_stakeholder_group: string | null;
  proposed_blocker_flag: boolean | null;
  proposed_notes: string | null;
}

interface NativeReviewCopilotResponse {
  result: {
    suggestions: NativeReviewCopilotSuggestion[];
  };
  model: string;
}

interface UseReviewCopilotParams {
  isDemoMode: boolean;
  blocks: WorkBlock[];
  setReviewSuggestions: React.Dispatch<React.SetStateAction<ReviewCopilotSuggestion[]>>;
  snapshot: WeeklyCapacitySnapshot;
  activeWindowSessions: ActivitySession[];
  currentWeekId: string;
  currentWeekRangeLabel: string;
  calendarEvents: OutlookCalendarEvent[];
  corrections: UserCorrection[];
  aiConfig: AIConfig | null;
  setAuditEvents: React.Dispatch<React.SetStateAction<AuditEvent[]>>;
}

export function useReviewCopilot({
  isDemoMode,
  blocks,
  setReviewSuggestions,
  snapshot,
  activeWindowSessions,
  currentWeekId,
  currentWeekRangeLabel,
  calendarEvents,
  corrections,
  aiConfig,
  setAuditEvents,
}: UseReviewCopilotParams) {
  const [reviewCopilotStatus, reviewCopilotError, reviewCopilotAsync] =
    useAsyncStatus<"idle" | "generating">("idle");

  async function generateReviewCopilotSuggestions() {
    if (isDemoMode) return;
    if (reviewCopilotStatus === "generating") return;

    const unverifiedBlocks = blocks.filter((block) => !block.user_verified);
    if (unverifiedBlocks.length === 0) {
      reviewCopilotAsync.fail("There are no unverified blocks for the Review Copilot to inspect.");
      return;
    }

    const startedAt = new Date().toISOString();
    const prompt = buildReviewCopilotPrompt({
      weekId: currentWeekId,
      weekRangeLabel: currentWeekRangeLabel,
      snapshot,
      reviewQueue: unverifiedBlocks,
      allBlocks: blocks,
      activeWindowSessions,
      calendarEvents,
      corrections,
    });

    reviewCopilotAsync.start("generating");

    try {
      const response = await invoke<NativeReviewCopilotResponse>(
        "generate_review_copilot_suggestions_with_openai",
        { request: { prompt, ai_config: aiConfig } }
      );
      const blockIds = new Set(blocks.map((block) => block.work_block_id));
      const suggestions = response.result.suggestions
        .map<ReviewCopilotSuggestion>((suggestion) => ({
          ...suggestion,
          work_block_ids: suggestion.work_block_ids.filter((blockId) => blockIds.has(blockId)),
          suggestion_id: `review-${stableHash(
            `${startedAt}-${suggestion.action}-${suggestion.work_block_ids.join("|")}-${suggestion.title}`
          )}`,
        }))
        .filter((suggestion) => suggestion.work_block_ids.length > 0);

      setReviewSuggestions(suggestions);
      reviewCopilotAsync.setStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "review_copilot",
          source: "openai_responses_api",
          title: "Review Copilot suggestions generated",
          summary: `${suggestions.length} suggestions generated for ${unverifiedBlocks.length} unverified blocks`,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            model: response.model,
            prompt_version: REVIEW_COPILOT_PROMPT_VERSION,
            review_queue_count: unverifiedBlocks.length,
            suggestion_count: suggestions.length,
            sent_to_openai: true,
            store: false,
          },
        }),
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reviewCopilotAsync.fail(message);
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "review_copilot",
          source: "openai_responses_api",
          title: "Review Copilot failed",
          summary: message,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            prompt_version: REVIEW_COPILOT_PROMPT_VERSION,
            review_queue_count: unverifiedBlocks.length,
            sent_to_openai: true,
          },
        }),
      ].slice(-1000));
    }
  }

  return {
    reviewCopilotStatus,
    reviewCopilotError,
    generateReviewCopilotSuggestions,
    resetReviewCopilot: reviewCopilotAsync.reset,
  };
}
