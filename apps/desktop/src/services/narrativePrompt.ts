import type {
  ActivitySession,
  OutlookCalendarEvent,
  UserCorrection,
  VisualContextInsight,
  WeeklyCapacitySnapshot,
  WorkBlock
} from "../../../../packages/domain/src/models";

export const NARRATIVE_PROMPT_VERSION = "clear-capacity-weekly-narrative-v2";

function sortByStartTime<T extends { start_time: string }>(items: T[]) {
  return [...items].sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}

function summarizeBlock(block: WorkBlock) {
  return {
    id: block.work_block_id,
    start_time: block.start_time,
    end_time: block.end_time,
    capacity_pct: Math.round(block.estimated_capacity_pct),
    category: block.category,
    mode: block.mode,
    planned_status: block.planned_status,
    project_name: block.project_name,
    stakeholder_group: block.stakeholder_group,
    confidence: block.confidence,
    user_verified: block.user_verified,
    blocker_flag: block.blocker_flag,
    evidence: block.evidence
  };
}

function summarizeSession(session: ActivitySession) {
  return {
    id: session.session_id,
    start_time: session.start_time,
    end_time: session.end_time,
    app_name: session.app_name,
    window_title: session.window_title,
    duration_minutes: session.duration_minutes,
    sample_count: session.sample_count,
    evidence: session.evidence
  };
}

function summarizeCalendarEvent(event: OutlookCalendarEvent) {
  return {
    id: event.calendar_event_id,
    title: event.title,
    start_time: event.start_time,
    end_time: event.end_time,
    organizer: event.organizer,
    attendee_count: event.attendee_count
  };
}

function summarizeVisualInsight(insight: VisualContextInsight) {
  return {
    id: insight.insight_id,
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
    work_block_id: correction.work_block_id,
    old_value: correction.old_value,
    new_value: correction.new_value,
    timestamp: correction.timestamp,
    reason: correction.reason
  };
}

export function buildWeeklyNarrativePrompt({
  weekId,
  weekRangeLabel,
  snapshot,
  blocks,
  activeWindowSessions,
  calendarEvents,
  visualContextInsights,
  corrections
}: {
  weekId: string;
  weekRangeLabel: string;
  snapshot: WeeklyCapacitySnapshot;
  blocks: WorkBlock[];
  activeWindowSessions: ActivitySession[];
  calendarEvents: OutlookCalendarEvent[];
  visualContextInsights: VisualContextInsight[];
  corrections: UserCorrection[];
}) {
  const verifiedCount = blocks.filter((block) => block.user_verified).length;
  const unverifiedCount = blocks.length - verifiedCount;
  const recentCorrections = [...corrections]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 30);
  const context = {
    product: "ClearCapacity",
    prompt_version: NARRATIVE_PROMPT_VERSION,
    objective:
      "Generate a weekly workload narrative for an analyst using local ledger, daily review, and weekly capacity context.",
    audience: {
      analyst_view: "Helps the analyst prepare for planning and 1:1 conversations.",
      manager_ready_view:
        "Can be shared after user review. It should explain capacity and risk without sounding like a productivity score."
    },
    guardrails: [
      "Do not imply surveillance, performance scoring, or perfect time tracking.",
      "Use percentages of a standard 40-hour week as the main language.",
      `Refer to the week as "${weekRangeLabel}" in all prose. The ISO week_id "${weekId}" is internal metadata only; never quote it in headline, summary_text, key_drivers, or manager_ready_summary.`,
      "Separate observed evidence from inference.",
      "Mention low confidence or missing review when it materially affects trust.",
      "Do not expose raw private data beyond what is needed to explain workload patterns.",
      "If visual context is sensitive or low-confidence, summarize the work pattern without exposing specific sensitive content.",
      "If the week has sessions but no reviewed work blocks, say the model has signal but limited classification confidence."
    ],
    reflection_questions_to_answer: [
      "What projects or workstreams did the analyst appear focused on this week?",
      "What made the week productive, difficult, or unusual?",
      "What displaced planned work, if anything?",
      "Was the analyst busy or near full capacity based on the available evidence?",
      "Is there reliable capacity for additional planned projects next week?"
    ],
    required_output: {
      week_id: "string",
      headline: `One short title sentence under 90 characters with the main capacity story for ${weekRangeLabel}. Do not include the ISO week id.`,
      summary_text:
        "Analyst-facing paragraph, 5 to 8 sentences. Describe what the analyst worked on, likely projects/workstreams, what went well or created friction, what displaced planned work, whether the week looked busy or under-classified, and whether additional project capacity looks realistic. Include planned vs reactive, meetings/recurring load, fragmented/deep work, and confidence caveats when relevant.",
      key_drivers:
        "4 to 7 concise bullets as strings. Make them descriptive enough for 1:1 prep, and do not include the ISO week id.",
      manager_ready_summary:
        "One polished paragraph for a manager, 4 to 7 sentences. Explain the main work focus, constraints, what displaced planned work, reliable new-work capacity, and review caveats without sounding like a productivity score. Do not include the ISO week id."
    },
    week: {
      internal_week_id: weekId,
      display_range: weekRangeLabel,
      baseline: "100% = standard 40-hour work week"
    },
    weekly_capacity_snapshot: snapshot,
    daily_review_context: {
      total_blocks: blocks.length,
      verified_blocks: verifiedCount,
      unverified_blocks: unverifiedCount,
      correction_count: corrections.length,
      recent_corrections: recentCorrections.map(summarizeCorrection)
    },
    ledger_context: {
      work_blocks: sortByStartTime(blocks).map(summarizeBlock),
      active_window_sessions: sortByStartTime(activeWindowSessions).map(summarizeSession),
      outlook_calendar_events: sortByStartTime(calendarEvents).map(summarizeCalendarEvent),
      visual_context_insights: [...visualContextInsights]
        .sort((left, right) => new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime())
        .map(summarizeVisualInsight)
    }
  };

  return [
    "Generate the ClearCapacity weekly narrative from this structured context.",
    "Return strict JSON only. Do not include markdown.",
    JSON.stringify(context, null, 2)
  ].join("\n\n");
}
