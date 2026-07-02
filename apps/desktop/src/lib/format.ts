import type { WorkBlock, WorkCategory, UserCorrection, ReviewCopilotAction, AccelerationPlayType } from "../../../../packages/domain/src/models";
import type { AuditEventType } from "../../../../packages/domain/src/models";
import type { ForecastAccuracyRating } from "../../../../packages/inference/src/capacity";
import type { RealizedSavingsRating } from "../../../../packages/inference/src/accelerate";

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
  const startMs = start.getTime();
  const endMs = end.getTime();
  const head = `${formatTime(block.start_time)} - ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(end)}`;
  // A malformed start_time/end_time yields NaN here; omit the duration suffix
  // rather than rendering "… (NaN min)".
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return head;
  }
  return `${head} (${Math.round((endMs - startMs) / 60000)} min)`;
}

/** A 12-hour clock label for a local hour bucket (0–23), e.g. 0 → "12am", 14 → "2pm". */
export function formatHourOfDay(hour: number): string {
  const normalized = ((Math.round(hour) % 24) + 24) % 24;
  const meridiem = normalized < 12 ? "am" : "pm";
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}${meridiem}`;
}

/** Compact 12-hour clock label for a local hour bucket (0–23), e.g. 0 → "12a", 14 → "2p". */
export function formatHourCompact(hour: number): string {
  const normalized = ((Math.round(hour) % 24) + 24) % 24;
  if (normalized === 0) return "12a";
  if (normalized === 12) return "12p";
  return normalized < 12 ? `${normalized}a` : `${normalized - 12}p`;
}

/** Spoken 12-hour clock label for a local hour bucket (0–23), e.g. 0 → "12 am", 14 → "2 pm". */
export function formatHourA11y(hour: number): string {
  const normalized = ((Math.round(hour) % 24) + 24) % 24;
  if (normalized === 0) return "12 am";
  if (normalized === 12) return "12 pm";
  return normalized < 12 ? `${normalized} am` : `${normalized - 12} pm`;
}

/**
 * Relative label for a day offset (0 = today, 1 = yesterday, else the weekday name).
 * `long` picks the full form ("Yesterday" / "Monday") over the compact one ("Yest." / "Mon").
 */
export function formatRelativeDayLabel(diffDays: number, options?: { long?: boolean }): string {
  const long = options?.long ?? false;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return long ? "Yesterday" : "Yest.";
  const d = new Date();
  d.setDate(d.getDate() - diffDays);
  return d.toLocaleDateString("en-US", { weekday: long ? "long" : "short" });
}

/** ISO timestamp → local "HH:MM" value for a `<input type="time">`. */
export function toLocalTimeInput(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Apply a local "HH:MM" value onto an ISO timestamp, keeping its date. A malformed
 * `hhmm` yields NaN hours/minutes, and `d.setHours(NaN, NaN)` produces an Invalid Date
 * whose `.toISOString()` THROWS — so guard the parse and return the original ISO unchanged.
 */
export function applyLocalTime(originalIso: string, hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return originalIso;
  const d = new Date(originalIso);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function compactCategory(category: WorkCategory) {
  return category.replace(" / ", " / ").replace(" stakeholder ", " ");
}

export function pct(value: number) {
  return `${Math.round(value)}%`;
}

/**
 * Humanize a minutes count for a duration label: "45 min" below an hour, "2h 5m" at or above
 * one. Rounds to whole minutes and clamps NaN/negatives to 0, so a fractional or malformed
 * duration never renders "12.333 min" or "0h -3m". Shared by the session/observed-time labels
 * (CompactWidget, ActivityCapturePanel) so long durations read consistently everywhere.
 */
export function formatDurationMinutes(minutes: number): string {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}h ${mins}m`;
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

const REVIEW_ACTION_LABELS: Record<ReviewCopilotAction, string> = {
  confirm: "Confirm",
  relabel: "Relabel",
  exclude: "Exclude",
  merge: "Merge blocks",
  split: "Split block",
  note: "Add note",
};

export function reviewActionLabel(action: ReviewCopilotAction): string {
  return REVIEW_ACTION_LABELS[action] ?? action;
}

const ACCELERATION_TYPE_LABELS: Record<AccelerationPlayType, string> = {
  automate: "Automate",
  tool: "Tool",
  technique: "Technique",
};

export function accelerationTypeLabel(type: AccelerationPlayType): string {
  return ACCELERATION_TYPE_LABELS[type] ?? type;
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

const FORECAST_RATING_LABELS: Record<ForecastAccuracyRating, string> = {
  on_target: "On target",
  close: "Close",
  off: "Off",
};

export function forecastRatingLabel(rating: ForecastAccuracyRating): string {
  return FORECAST_RATING_LABELS[rating];
}

const REALIZED_SAVINGS_RATING_LABELS: Record<RealizedSavingsRating, string> = {
  beat: "Beat estimate",
  met: "On track",
  missed: "Below estimate",
};

// Humanize an acceleration realized-savings rating for the track-record chip (never raw snake_case).
export function realizedSavingsRatingLabel(rating: RealizedSavingsRating): string {
  return REALIZED_SAVINGS_RATING_LABELS[rating];
}

// Turn the rolling mean signed forecast error into a plain-language bias phrase, so the
// accuracy line can say whether the model systematically over- or under-predicts (a
// self-correcting cue). Positive = over-predicts. Returns "" when the average bias rounds
// to under a point, so a well-calibrated model shows no noise.
export function forecastBiasPhrase(meanSignedErrorPts: number): string {
  const rounded = Math.round(meanSignedErrorPts);
  if (rounded === 0) return "";
  const direction = rounded > 0 ? "over-predict" : "under-predict";
  return `tends to ${direction} by ~${Math.abs(rounded)} pts`;
}

// Render an ISO week id ("2026-W26") as a readable label without date math, so the
// forecast track record can title each row. Falls back to the raw id if it doesn't parse.
export function formatIsoWeekLabel(weekId: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) return weekId;
  return `Week ${Number(match[2])}, ${match[1]}`;
}

// Plain-language labels for the known `AuditEvent.source` identifiers, so the audit
// detail header never surfaces a raw snake_case internal id. Anything unmapped falls
// back to a Title-Case-from-snake_case rendering via `sourceLabel`.
const AUDIT_SOURCE_LABELS: Record<string, string> = {
  review_layer: "Review layer",
  openai_responses_api: "OpenAI Responses API",
  openai_vision: "OpenAI Vision",
  macos_active_window: "macOS active window",
  outlook_ics: "Outlook .ics",
  chat_export: "Chat export",
  proactive_alerts: "Proactive alerts",
  acceleration_engine: "Acceleration engine",
  privacy_control: "Privacy control",
  sessionizer: "Sessionizer",
  onboarding: "Onboarding",
  walkthrough: "Walkthrough",
};

// Humanize an `AuditEvent.source` for display (never render the raw snake_case id).
export function sourceLabel(source: string): string {
  const mapped = AUDIT_SOURCE_LABELS[source];
  if (mapped) return mapped;
  // Title-Case-from-snake_case fallback for any source not in the map.
  return source
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function auditTypeLabel(type: AuditEventType) {
  const labels: Record<AuditEventType, string> = {
    active_window_sample: "Capture",
    activity_session: "Session",
    calendar_import: "Calendar",
    chat_import: "Chat",
    user_correction: "Correction",
    narrative_generation: "Narrative",
    work_block_classification: "Classifier",
    review_copilot: "Copilot",
    proactive_alert: "Alert",
    forecast_agent: "Forecast",
    visual_context: "Visual",
    privacy_pause: "Privacy",
    privacy_resume: "Privacy",
    retention_policy: "Privacy",
    acceleration_engine: "Acceleration",
    onboarding: "Onboarding"
  };

  return labels[type];
}
