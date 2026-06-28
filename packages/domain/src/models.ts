export type SourceType =
  | "window"
  | "calendar"
  | "browser"
  | "slack"
  | "task"
  | "git"
  | "manual";

export type PrivacyLevel = "local_only" | "derived_only" | "excluded";

export type WorkCategory =
  | "Planned analysis / project work"
  | "Ad hoc stakeholder requests"
  | "Recurring reporting"
  | "Dashboard development / edits"
  | "SQL / data modeling / query work"
  | "QA / data validation"
  | "Debugging / issue investigation"
  | "Documentation / requirement clarification"
  | "Meetings / stakeholder syncs"
  | "Admin / coordination"
  | "Blocked / waiting / dependency delay";

export type WorkMode = "Deep work" | "Reactive" | "Collaborative" | "Fragmented" | "Blocked";

export type PlannedStatus = "planned" | "unplanned" | "fixed" | "blocked";

export interface RawEvent {
  event_id: string;
  user_id: string;
  timestamp_start: string;
  timestamp_end: string;
  source_type: SourceType;
  app_name: string | null;
  window_title: string | null;
  domain: string | null;
  file_path: string | null;
  project_hint: string | null;
  metadata: Record<string, string | null>;
  privacy_level: PrivacyLevel;
}

export interface ActiveWindowSample {
  sample_id: string;
  timestamp: string;
  app_name: string;
  window_title: string | null;
  source_type: "macos_active_window";
  privacy_level: PrivacyLevel;
}

export interface ActivitySession {
  session_id: string;
  start_time: string;
  end_time: string;
  app_name: string;
  window_title: string | null;
  duration_minutes: number;
  sample_count: number;
  evidence: string[];
}

export type AuditEventType =
  | "active_window_sample"
  | "activity_session"
  | "calendar_import"
  | "user_correction"
  | "narrative_generation"
  | "work_block_classification"
  | "review_copilot"
  | "forecast_agent"
  | "visual_context"
  | "privacy_pause"
  | "privacy_resume"
  | "retention_policy"
  | "proactive_alert"
  | "onboarding";

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  type: AuditEventType;
  source: string;
  title: string;
  summary: string;
  privacy_level: PrivacyLevel;
  details: Record<string, unknown>;
}

export interface NormalizedActivity {
  activity_id: string;
  start_time: string;
  end_time: string;
  source_cluster: string[];
  activity_label_candidate: string;
  project_candidate: string | null;
  evidence: string[];
  confidence: number;
}

export interface WorkBlock {
  work_block_id: string;
  week_id: string;
  start_time: string;
  end_time: string;
  estimated_capacity_pct: number;
  category: WorkCategory;
  mode: WorkMode;
  planned_status: PlannedStatus;
  project_name: string;
  stakeholder_group: string;
  derived_from: string[];
  evidence: string[];
  confidence: number;
  user_verified: boolean;
  blocker_flag: boolean;
  notes: string | null;
}

export interface OutlookCalendarEvent {
  calendar_event_id: string;
  uid: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  organizer: string | null;
  attendee_count: number;
  source: "outlook_ics";
  imported_at: string;
}

export interface UserCorrection {
  correction_id: string;
  work_block_id: string;
  field:
    | "category"
    | "mode"
    | "planned_status"
    | "project_name"
    | "stakeholder_group"
    | "blocker_flag"
    | "notes"
    | "exclude"
    | "verification"
    | "manager_summary"
    | "calendar_import"
    | "start_time"
    | "end_time";
  old_value: string;
  new_value: string;
  timestamp: string;
  reason: string;
}

export type ReviewCopilotAction = "confirm" | "relabel" | "exclude" | "merge" | "split" | "note";

export interface ReviewCopilotSuggestion {
  suggestion_id: string;
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

export interface ForecastAgentResult {
  forecast_week_label: string;
  reliable_new_work_capacity_pct: number;
  confidence: number;
  headline: string;
  summary_text: string;
  key_constraints: string[];
  risk_flags: string[];
  recommended_actions: string[];
  assumptions: string[];
  optimistic_capacity_pct: number;
  likely_capacity_pct: number;
  conservative_capacity_pct: number;
}

export interface VisualContextInsight {
  insight_id: string;
  captured_at: string;
  session_id: string | null;
  app_name: string;
  window_title: string | null;
  activity_summary: string;
  visible_tool: string | null;
  likely_work_category: WorkCategory | null;
  likely_mode: WorkMode | null;
  project_hint: string | null;
  sensitive_content_detected: boolean;
  confidence: number;
  evidence: string[];
  privacy_level: PrivacyLevel;
  model: string;
  raw_screenshot_retained: boolean;
}

export interface WeeklyCapacitySnapshot {
  week_id: string;
  capacity_baseline_pct: number;
  allocated_pct: number;
  deep_work_pct: number;
  fragmented_work_pct: number;
  meeting_pct: number;
  reactive_pct: number;
  planned_pct: number;
  blocked_pct: number;
  recurring_pct: number;
  reliable_new_work_capacity_pct: number;
  carryover_risk_pct: number;
  wip_load_score: number;
  context_switch_score: number;
  summary_confidence: number;
  category_allocation: Array<{ label: WorkCategory; value: number }>;
  work_mode_allocation: Array<{ label: WorkMode; value: number }>;
}

export interface WeeklyNarrative {
  week_id: string;
  headline: string;
  summary_text: string;
  key_drivers: string[];
  manager_ready_summary: string;
}

export type AIProvider = "openai" | "grok" | "claude" | "deepseek" | "custom";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string; // stored locally, not sent to cloud except for the chosen provider
  baseUrl?: string; // for custom or overrides
  model: string;
  visionModel?: string;
  // future: temperature, etc.
}
