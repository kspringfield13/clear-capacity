import type { AuditEvent, SavedSkill, WorkBlock } from "../../../../packages/domain/src/models";

// Local-first data portability: serialize the work ledger and audit trail to
// JSON or CSV so the user can take their data with them. Everything here runs in
// the browser/webview — the produced text is handed to `downloadTextFile`, which
// saves a file locally and never touches the network.

export type ExportFormat = "json" | "csv";

interface ExportEnvelope<T> {
  app: "ClearCapacity";
  kind: string;
  exported_at: string;
  count: number;
  records: T[];
}

/**
 * RFC 4180 cell: quote when the value contains a comma, quote, or newline. Cells
 * that start with a formula trigger (= + - @ and tab/CR) are prefixed with a
 * single quote so spreadsheet apps treat them as text, not formulas (CSV
 * injection guard) — our exported numeric columns are never negative, so this
 * only neutralizes user/AI-authored text fields.
 */
function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function envelope<T>(kind: string, records: T[]): string {
  const payload: ExportEnvelope<T> = {
    app: "ClearCapacity",
    kind,
    exported_at: new Date().toISOString(),
    count: records.length,
    records,
  };
  return JSON.stringify(payload, null, 2);
}

// CSV column projections. The work-ledger CSV omits the array fields
// (`evidence`, `derived_from`); the audit CSV keeps `details` as a JSON-stringified
// cell. Either way the JSON export retains every field at full fidelity.
const WORK_BLOCK_COLUMNS: Array<[string, (block: WorkBlock) => unknown]> = [
  ["work_block_id", (b) => b.work_block_id],
  ["week_id", (b) => b.week_id],
  ["start_time", (b) => b.start_time],
  ["end_time", (b) => b.end_time],
  ["estimated_capacity_pct", (b) => b.estimated_capacity_pct],
  ["category", (b) => b.category],
  ["mode", (b) => b.mode],
  ["planned_status", (b) => b.planned_status],
  ["project_name", (b) => b.project_name],
  ["stakeholder_group", (b) => b.stakeholder_group],
  ["confidence", (b) => b.confidence],
  ["user_verified", (b) => b.user_verified],
  ["blocker_flag", (b) => b.blocker_flag],
  ["notes", (b) => b.notes],
];

// Saved-skills CSV keeps every scalar; `recommended_tools` is joined into one cell
// (the JSON export retains it as an array at full fidelity). All fields are derived —
// no window titles — so exporting them to a local file is privacy-safe.
const SAVED_SKILL_COLUMNS: Array<[string, (skill: SavedSkill) => unknown]> = [
  ["signal_id", (s) => s.signal_id],
  ["play_type", (s) => s.play_type],
  ["title", (s) => s.title],
  ["detail", (s) => s.detail],
  ["recipe", (s) => s.recipe],
  ["recommended_tools", (s) => s.recommended_tools.join("; ")],
  ["estimated_minutes_saved_per_week", (s) => s.estimated_minutes_saved_per_week],
  ["saved_at", (s) => s.saved_at],
];

const AUDIT_COLUMNS: Array<[string, (event: AuditEvent) => unknown]> = [
  ["event_id", (e) => e.event_id],
  ["timestamp", (e) => e.timestamp],
  ["type", (e) => e.type],
  ["source", (e) => e.source],
  ["title", (e) => e.title],
  ["summary", (e) => e.summary],
  ["privacy_level", (e) => e.privacy_level],
  ["details", (e) => e.details],
];

export function serializeWorkLedger(blocks: WorkBlock[], format: ExportFormat): string {
  if (format === "json") return envelope("work_ledger", blocks);
  return toCsv(
    WORK_BLOCK_COLUMNS.map(([header]) => header),
    blocks.map((block) => WORK_BLOCK_COLUMNS.map(([, get]) => get(block)))
  );
}

export function serializeSavedSkills(skills: SavedSkill[], format: ExportFormat): string {
  if (format === "json") return envelope("saved_skills", skills);
  return toCsv(
    SAVED_SKILL_COLUMNS.map(([header]) => header),
    skills.map((skill) => SAVED_SKILL_COLUMNS.map(([, get]) => get(skill)))
  );
}

export function serializeAuditTrail(events: AuditEvent[], format: ExportFormat): string {
  if (format === "json") return envelope("audit_trail", events);
  return toCsv(
    AUDIT_COLUMNS.map(([header]) => header),
    events.map((event) => AUDIT_COLUMNS.map(([, get]) => get(event)))
  );
}

export function exportMimeType(format: ExportFormat): string {
  return format === "json" ? "application/json" : "text/csv";
}

/** `clear-capacity-work_ledger-2026-06-28-14-05-22.csv` */
export function exportFilename(kind: string, format: ExportFormat, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `clear-capacity-${kind}-${stamp}.${format}`;
}

/** Trigger a local file download from in-memory text (browser + Tauri webview). */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
