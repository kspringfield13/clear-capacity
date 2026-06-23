import type {
  ActivitySession,
  AuditEvent,
  OutlookCalendarEvent,
  PlannedStatus,
  UserCorrection,
  VisualContextInsight,
  WorkBlock,
  WorkCategory,
  WorkMode,
  AIConfig,
} from "../../../../packages/domain/src/models";
import { useAsyncStatus } from "./useAsyncStatus";
import { buildWorkBlockClassifierPrompt, WORK_BLOCK_CLASSIFIER_PROMPT_VERSION } from "../services/workBlockClassifierPrompt";
import { aiCompleteJson, jsonSchemaFormat } from "../services/aiComplete";
import { WORK_BLOCK_CLASSIFIER_INSTRUCTIONS, workBlockClassifierSchema } from "../services/workBlockClassifierSchema";
import { createAuditEvent } from "../lib/audit";
import { stableHash, capacityPctFromMinutes } from "../lib/blocks";

interface NativeClassifiedWorkBlock {
  session_ids: string[];
  start_time: string;
  end_time: string;
  category: WorkCategory;
  mode: WorkMode;
  planned_status: PlannedStatus;
  project_name: string;
  stakeholder_group: string;
  evidence: string[];
  confidence: number;
  blocker_flag: boolean;
  notes: string | null;
}

interface UseClassificationParams {
  isDemoMode: boolean;
  blocks: WorkBlock[];
  setBlocks: React.Dispatch<React.SetStateAction<WorkBlock[]>>;
  activeWindowSessions: ActivitySession[];
  currentWeekId: string;
  currentWeekRangeLabel: string;
  visualContextInsights: VisualContextInsight[];
  calendarEvents: OutlookCalendarEvent[];
  corrections: UserCorrection[];
  aiConfig: AIConfig | null;
  setAuditEvents: React.Dispatch<React.SetStateAction<AuditEvent[]>>;
}

function classifiedBlockToWorkBlock(
  block: NativeClassifiedWorkBlock,
  sourceSessions: Map<string, ActivitySession>,
  currentWeekId: string
): WorkBlock | null {
  const sessions = block.session_ids
    .map((sessionId) => sourceSessions.get(sessionId))
    .filter((session): session is ActivitySession => Boolean(session));

  if (sessions.length === 0) return null;

  const parsedStart = new Date(block.start_time).getTime();
  const parsedEnd = new Date(block.end_time).getTime();
  const startCandidates = sessions.map((session) => new Date(session.start_time).getTime());
  const endCandidates = sessions.map((session) => new Date(session.end_time).getTime());
  if (!Number.isNaN(parsedStart)) startCandidates.push(parsedStart);
  if (!Number.isNaN(parsedEnd)) endCandidates.push(parsedEnd);
  const startMs = Math.min(...startCandidates);
  const endMs = Math.max(...endCandidates);
  const durationMinutes = sessions.reduce((total, session) => total + session.duration_minutes, 0);
  const sessionIds = sessions.map((session) => session.session_id);
  const id = `ai-session-${stableHash(sessionIds.sort().join("|"))}`;

  return {
    work_block_id: id,
    week_id: currentWeekId,
    start_time: new Date(startMs).toISOString(),
    end_time: new Date(endMs).toISOString(),
    estimated_capacity_pct: capacityPctFromMinutes(durationMinutes),
    category: block.category,
    mode: block.mode,
    planned_status: block.planned_status,
    project_name: block.project_name.trim() || "Local activity",
    stakeholder_group: block.stakeholder_group.trim() || "Unknown stakeholder",
    derived_from: sessionIds,
    evidence: ["Drafted by OpenAI from local active-window sessions", ...block.evidence],
    confidence: Math.max(0.45, Math.min(0.9, block.confidence)),
    user_verified: false,
    blocker_flag: block.blocker_flag,
    notes: block.notes,
  };
}

export function useClassification({
  isDemoMode,
  blocks,
  setBlocks,
  activeWindowSessions,
  currentWeekId,
  currentWeekRangeLabel,
  visualContextInsights,
  calendarEvents,
  corrections,
  aiConfig,
  setAuditEvents,
}: UseClassificationParams) {
  const [classificationStatus, classificationError, classificationAsync] =
    useAsyncStatus<"idle" | "classifying">("idle");

  async function classifyActiveWindowSessions() {
    if (isDemoMode) return;
    if (classificationStatus === "classifying") return;

    const alreadyClassified = new Set(blocks.flatMap((block) => block.derived_from));
    const candidateSessions = activeWindowSessions
      .filter((session) => !alreadyClassified.has(session.session_id) && session.sample_count >= 2)
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());

    if (candidateSessions.length === 0) {
      classificationAsync.fail("No unclassified active-window sessions are ready yet.");
      return;
    }

    const startedAt = new Date().toISOString();
    const prompt = buildWorkBlockClassifierPrompt({
      weekId: currentWeekId,
      weekRangeLabel: currentWeekRangeLabel,
      sessions: candidateSessions,
      visualContextInsights,
      existingBlocks: blocks,
      calendarEvents,
      corrections,
    });

    classificationAsync.start("classifying");

    try {
      const { data, model } = await aiCompleteJson<{ work_blocks: NativeClassifiedWorkBlock[] }>({
        prompt,
        instructions: WORK_BLOCK_CLASSIFIER_INSTRUCTIONS,
        responseFormat: jsonSchemaFormat("clear_capacity_work_block_classification", workBlockClassifierSchema),
        aiConfig,
      });
      const sessionMap = new Map(candidateSessions.map((session) => [session.session_id, session]));
      const draftBlocks = data.work_blocks
        .map((block) => classifiedBlockToWorkBlock(block, sessionMap, currentWeekId))
        .filter((block): block is WorkBlock => Boolean(block));

      if (data.work_blocks.length === 0) {
        const message =
          `The ${aiConfig?.provider ?? "AI"} provider completed the request but returned no work blocks. ` +
          "Try again; ready sessions should now be grouped conservatively when their context is ambiguous.";
        classificationAsync.fail(message);
        setAuditEvents((current) => [
          ...current,
          createAuditEvent({
            type: "work_block_classification",
            source: "openai_responses_api",
            title: "Classification returned no work blocks",
            summary: message,
            privacy_level: "derived_only",
            timestamp: startedAt,
            details: {
              week_id: currentWeekId,
              week_range: currentWeekRangeLabel,
              model,
              prompt_version: WORK_BLOCK_CLASSIFIER_PROMPT_VERSION,
              input_session_count: candidateSessions.length,
              output_work_block_count: 0,
              sent_to_openai: true,
              store: false,
            },
          }),
        ].slice(-1000));
        return;
      }

      if (draftBlocks.length === 0) {
        const message =
          `The ${aiConfig?.provider ?? "AI"} provider returned work blocks, but none referenced valid session IDs. Please try again.`;
        classificationAsync.fail(message);
        setAuditEvents((current) => [
          ...current,
          createAuditEvent({
            type: "work_block_classification",
            source: "openai_responses_api",
            title: "Classification returned invalid session references",
            summary: message,
            privacy_level: "derived_only",
            timestamp: startedAt,
            details: {
              week_id: currentWeekId,
              week_range: currentWeekRangeLabel,
              model,
              prompt_version: WORK_BLOCK_CLASSIFIER_PROMPT_VERSION,
              input_session_count: candidateSessions.length,
              provider_work_block_count: data.work_blocks.length,
              output_work_block_count: 0,
              sent_to_openai: true,
              store: false,
            },
          }),
        ].slice(-1000));
        return;
      }

      setBlocks((current) => {
        const existingIds = new Set(current.map((block) => block.work_block_id));
        return [
          ...current,
          ...draftBlocks.filter((block) => !existingIds.has(block.work_block_id)),
        ].sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
      });
      classificationAsync.setStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "work_block_classification",
          source: "openai_responses_api",
          title: "Active-window sessions classified",
          summary: `${draftBlocks.length} draft work blocks created from ${candidateSessions.length} sessions`,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            model,
            prompt_version: WORK_BLOCK_CLASSIFIER_PROMPT_VERSION,
            input_session_count: candidateSessions.length,
            output_work_block_count: draftBlocks.length,
            work_block_ids: draftBlocks.map((block) => block.work_block_id),
            sent_to_openai: true,
            store: false,
          },
        }),
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      classificationAsync.fail(message);
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "work_block_classification",
          source: "openai_responses_api",
          title: "Active-window classification failed",
          summary: message,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            prompt_version: WORK_BLOCK_CLASSIFIER_PROMPT_VERSION,
            input_session_count: candidateSessions.length,
            sent_to_openai: true,
          },
        }),
      ].slice(-1000));
    }
  }

  return {
    classificationStatus,
    classificationError,
    classifyActiveWindowSessions,
    resetClassification: classificationAsync.reset,
  };
}
