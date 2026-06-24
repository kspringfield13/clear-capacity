import type {
  ActivitySession,
  OutlookCalendarEvent,
  UserCorrection,
  VisualContextInsight,
  WorkBlock
} from "../../../../packages/domain/src/models";
import { plannedStatuses, workCategories, workModes } from "../../../../packages/domain/src/taxonomy";

export const WORK_BLOCK_CLASSIFIER_PROMPT_VERSION = "clear-capacity-work-block-classifier-v2";

function sortByStartTime<T extends { start_time: string }>(items: T[]) {
  return [...items].sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}

function summarizeSession(session: ActivitySession) {
  return {
    session_id: session.session_id,
    start_time: session.start_time,
    end_time: session.end_time,
    app_name: session.app_name,
    window_title: session.window_title,
    duration_minutes: session.duration_minutes,
    sample_count: session.sample_count,
    evidence: session.evidence
  };
}

function summarizeExistingBlock(block: WorkBlock) {
  return {
    work_block_id: block.work_block_id,
    start_time: block.start_time,
    end_time: block.end_time,
    category: block.category,
    mode: block.mode,
    planned_status: block.planned_status,
    project_name: block.project_name,
    stakeholder_group: block.stakeholder_group,
    derived_from: block.derived_from,
    user_verified: block.user_verified
  };
}

function summarizeCalendarEvent(event: OutlookCalendarEvent) {
  return {
    calendar_event_id: event.calendar_event_id,
    title: event.title,
    start_time: event.start_time,
    end_time: event.end_time,
    organizer: event.organizer,
    location: event.location
  };
}

function summarizeVisualInsight(insight: VisualContextInsight) {
  return {
    insight_id: insight.insight_id,
    captured_at: insight.captured_at,
    session_id: insight.session_id,
    app_name: insight.app_name,
    window_title: insight.window_title,
    activity_summary: insight.activity_summary,
    visible_tool: insight.visible_tool,
    likely_work_category: insight.likely_work_category,
    likely_mode: insight.likely_mode,
    project_hint: insight.project_hint,
    sensitive_content_detected: insight.sensitive_content_detected,
    confidence: insight.confidence,
    evidence: insight.evidence
  };
}

function summarizeCorrection(correction: UserCorrection) {
  return {
    field: correction.field,
    old_value: correction.old_value,
    new_value: correction.new_value,
    reason: correction.reason,
    timestamp: correction.timestamp
  };
}

export function buildWorkBlockClassifierPrompt({
  weekId,
  weekRangeLabel,
  sessions,
  visualContextInsights,
  existingBlocks,
  calendarEvents,
  corrections
}: {
  weekId: string;
  weekRangeLabel: string;
  sessions: ActivitySession[];
  visualContextInsights: VisualContextInsight[];
  existingBlocks: WorkBlock[];
  calendarEvents: OutlookCalendarEvent[];
  corrections: UserCorrection[];
}) {
  const recentCorrections = [...corrections]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 40);
  const context = {
    product: "ClearCapacity",
    prompt_version: WORK_BLOCK_CLASSIFIER_PROMPT_VERSION,
    objective:
      "Convert active-window sessions into explainable draft work blocks for an analyst workload ledger. Use evidence from titles, calendar, and visuals. Be precise with categories.",
    guardrails: [
      "Classify only the provided active-window sessions.",
      "Do not create blocks for Outlook meetings; those are imported separately.",
      "Merge adjacent or related sessions when they appear to represent one coherent task.",
      "Every provided session has already passed the product's readiness threshold and should normally be assigned to a work block.",
      "Short duration alone is not a reason to omit a session; merge short fragments with related work when possible.",
      "When evidence is ambiguous, create a conservative generic block with lower confidence instead of returning no block.",
      "If input_sessions is non-empty, return at least one work block.",
      "Keep blocks draft-quality: confidence should reflect uncertainty.",
      "Use generic labels when app/window evidence is ambiguous.",
      "Never infer sensitive content beyond the visible app/window metadata.",
      "Omit a session only when the metadata clearly represents non-work system noise such as a lock screen or blank desktop."
    ],
    taxonomy: {
      categories: workCategories,
      work_modes: workModes,
      planned_statuses: plannedStatuses
    },
    week: {
      week_id: weekId,
      display_range: weekRangeLabel,
      baseline: "100% = standard 40-hour work week"
    },
    input_sessions: sortByStartTime(sessions).map(summarizeSession),
    visual_context_insights: visualContextInsights
      .filter((insight) => insight.session_id && sessions.some((session) => session.session_id === insight.session_id))
      .map(summarizeVisualInsight),
    existing_work_blocks: sortByStartTime(existingBlocks).map(summarizeExistingBlock),
    outlook_calendar_context: sortByStartTime(calendarEvents).map(summarizeCalendarEvent),
    recent_user_corrections: recentCorrections.map(summarizeCorrection),
    output_rules: {
      session_ids:
        "Every output work block must copy exact session_id values from input_sessions. Never invent or rewrite an ID. Use each session at most once.",
      title:
        "project_name should be a short human-readable task label, not merely the app name unless the evidence is ambiguous.",
      stakeholder:
        "stakeholder_group may be a team/function when visible, otherwise use Local activity, Personal workflow, or Unknown stakeholder.",
      evidence:
        "Provide 2 to 5 short evidence strings that explain the classification from visible metadata.",
      confidence:
        "Use 0.55 to 0.70 for ambiguous app-only evidence, 0.70 to 0.84 for plausible title/app matches, and 0.85+ only for very clear evidence."
    }
  };

  return [
    "Classify these ClearCapacity active-window sessions into draft work blocks.",
    "Return strict JSON only. Do not include markdown.",
    JSON.stringify(context, null, 2)
  ].join("\n\n");
}
