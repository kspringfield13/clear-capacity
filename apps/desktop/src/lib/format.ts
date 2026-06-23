import type { WorkBlock, WorkCategory, UserCorrection } from "../../../../packages/domain/src/models";
import type { AuditEventType } from "../../../../packages/domain/src/models";

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatRange(block: WorkBlock) {
  const start = new Date(block.start_time);
  const end = new Date(block.end_time);
  return `${formatTime(block.start_time)} - ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(end)} (${Math.round((end.getTime() - start.getTime()) / 60000)} min)`;
}

export function compactCategory(category: WorkCategory) {
  return category.replace(" / ", " / ").replace(" stakeholder ", " ");
}

export function pct(value: number) {
  return `${Math.round(value)}%`;
}

export function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function fieldLabel(field: UserCorrection["field"]) {
  const labels: Record<UserCorrection["field"], string> = {
    category: "Category",
    mode: "Mode",
    planned_status: "Planned status",
    project_name: "Project",
    stakeholder_group: "Stakeholder",
    blocker_flag: "Blocked flag",
    notes: "Notes",
    exclude: "Excluded block",
    verification: "Verified block",
    manager_summary: "Manager summary",
    calendar_import: "Calendar import",
    start_time: "Start time",
    end_time: "End time"
  };

  return labels[field];
}

const PLANNED_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  unplanned: "Unplanned",
  fixed: "Fixed",
  blocked: "Blocked",
};

export function plannedStatusLabel(status: string): string {
  return PLANNED_STATUS_LABELS[status] ?? status;
}

const PRIVACY_LABELS: Record<string, string> = {
  local_only: "Local only",
  derived_only: "Derived only",
  excluded: "Excluded",
};

const PRIVACY_TOOLTIPS: Record<string, string> = {
  local_only: "Raw data stays on this device and is never shared",
  derived_only: "Only anonymised summaries leave this device",
  excluded: "This event was excluded from all reports",
};

export function privacyLevelLabel(level: string): string {
  return PRIVACY_LABELS[level] ?? level;
}

export function privacyLevelTooltip(level: string): string {
  return PRIVACY_TOOLTIPS[level] ?? "";
}

export function humanizeCorrectionValue(field: UserCorrection["field"], value: string): string {
  if (field === "planned_status") return plannedStatusLabel(value);
  if (field === "start_time" || field === "end_time") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return formatTime(value);
  }
  return value;
}

export function auditTypeLabel(type: AuditEventType) {
  const labels: Record<AuditEventType, string> = {
    active_window_sample: "Capture",
    activity_session: "Session",
    calendar_import: "Calendar",
    user_correction: "Correction",
    narrative_generation: "Narrative",
    work_block_classification: "Classifier",
    review_copilot: "Copilot",
    forecast_agent: "Forecast",
    visual_context: "Visual",
    privacy_pause: "Privacy",
    privacy_resume: "Privacy"
  };

  return labels[type];
}
