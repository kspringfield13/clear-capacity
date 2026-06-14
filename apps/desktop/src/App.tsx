import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity,
  AlignLeft,
  BarChart3,
  CalendarCheck,
  Check,
  ClipboardCopy,
  Eye,
  FileText,
  History,
  Maximize2,
  Monitor,
  Lock,
  Minimize2,
  Moon,
  Pause,
  PanelLeft,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SplitSquareHorizontal,
  Tag,
  TimerReset,
  Upload,
  X
} from "lucide-react";
import { computeWeeklyCapacitySnapshot, generateWeeklyNarrative } from "../../../packages/inference/src/capacity";
import { sessionizeActiveWindowSamples } from "../../../packages/inference/src/sessionizer/activeWindow";
import { outlookEventsToWorkBlocks, parseOutlookIcs } from "../../../packages/integrations/src/calendar/outlookIcs";
import { categoryColors, plannedStatuses, workCategories, workModes } from "../../../packages/domain/src/taxonomy";
import type {
  ActiveWindowSample,
  ActivitySession,
  AuditEvent,
  AuditEventType,
  ForecastAgentResult,
  OutlookCalendarEvent,
  PlannedStatus,
  ReviewCopilotAction,
  ReviewCopilotSuggestion,
  UserCorrection,
  VisualContextInsight,
  WorkBlock,
  WorkCategory,
  WorkMode
} from "../../../packages/domain/src/models";
import { clearPersistedState, readPersistedState, writePersistedState } from "./services/localStore";
import type { PersistedForecastRecord, PersistedNarrativeRecord } from "./services/localStore";
import { buildForecastAgentPrompt, FORECAST_AGENT_PROMPT_VERSION } from "./services/forecastAgentPrompt";
import { buildWeeklyNarrativePrompt, NARRATIVE_PROMPT_VERSION } from "./services/narrativePrompt";
import { buildReviewCopilotPrompt, REVIEW_COPILOT_PROMPT_VERSION } from "./services/reviewCopilotPrompt";
import { buildVisualContextPrompt, VISUAL_CONTEXT_PROMPT_VERSION } from "./services/visualContextPrompt";
import {
  buildWorkBlockClassifierPrompt,
  WORK_BLOCK_CLASSIFIER_PROMPT_VERSION
} from "./services/workBlockClassifierPrompt";

type Screen = "setup" | "ledger" | "daily" | "weekly" | "narrative" | "audit";
type WindowMode = "large" | "compact";

interface AppToolbarAction {
  label: string;
  icon: typeof ShieldCheck;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary";
}

interface NativeActiveWindowPayload {
  timestamp_ms: number;
  app_name: string | null;
  window_title: string | null;
  capture_error: string | null;
}

interface NativeNarrativeGenerationResponse {
  narrative: ReturnType<typeof generateWeeklyNarrative>;
  model: string;
}

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

interface NativeWorkBlockClassificationResponse {
  result: {
    work_blocks: NativeClassifiedWorkBlock[];
  };
  model: string;
}

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

interface NativeForecastAgentResponse {
  forecast: ForecastAgentResult;
  model: string;
}

interface NativeVisualContextResponse {
  insight: Omit<
    VisualContextInsight,
    | "insight_id"
    | "captured_at"
    | "session_id"
    | "app_name"
    | "window_title"
    | "privacy_level"
    | "model"
    | "raw_screenshot_retained"
  >;
  model: string;
  captured_at_ms: number;
  app_name: string;
  window_title: string | null;
  session_id: string | null;
  raw_screenshot_retained: boolean;
}

const screens: Array<{ id: Screen; label: string; icon: typeof ShieldCheck }> = [
  { id: "setup", label: "Setup", icon: ShieldCheck },
  { id: "ledger", label: "Ledger", icon: Activity },
  { id: "daily", label: "Daily Review", icon: CalendarCheck },
  { id: "weekly", label: "Weekly Capacity", icon: BarChart3 },
  { id: "narrative", label: "Narrative", icon: FileText },
  { id: "audit", label: "Audit Log", icon: AlignLeft }
];

const sources = [
  { label: "Outlook calendar import", detail: "Local .ics files only; meeting titles and time windows", enabled: true },
  { label: "Active window sessions", detail: "Foreground app and window title metadata grouped locally", enabled: true }
];

const MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY = 8;
const MIN_VISUAL_CONTEXT_SESSION_MINUTES = 10;
const MIN_VISUAL_CONTEXT_GAP_MS = 45 * 60 * 1000;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRange(block: WorkBlock) {
  const start = new Date(block.start_time);
  const end = new Date(block.end_time);
  return `${formatTime(block.start_time)} - ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(end)} (${Math.round((end.getTime() - start.getTime()) / 60000)} min)`;
}

function compactCategory(category: WorkCategory) {
  return category.replace(" / ", " / ").replace(" stakeholder ", " ");
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function capacityPctFromMinutes(minutes: number) {
  return Math.max(0.25, Math.round((Math.max(1, minutes) / (40 * 60)) * 100));
}

function getCurrentIsoWeekId(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function ordinalDay(day: number) {
  const teenRemainder = day % 100;
  if (teenRemainder >= 11 && teenRemainder <= 13) {
    return `${day}th`;
  }

  const suffixes = ["th", "st", "nd", "rd"];
  return `${day}${suffixes[day % 10] ?? "th"}`;
}

function formatWeekdayMonthDay(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);

  return `${weekday}, ${month} ${ordinalDay(date.getDate())}`;
}

function getBusinessWeekRangeLabel(date = new Date()) {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() + 1 - day);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return `${formatWeekdayMonthDay(monday)} - ${formatWeekdayMonthDay(friday)}`;
}

function replaceIsoWeekIds(value: string, weekRangeLabel: string) {
  return value.replace(/\b\d{4}-W\d{2}\b/g, weekRangeLabel);
}

function displaySafeNarrative(
  narrative: ReturnType<typeof generateWeeklyNarrative>,
  weekRangeLabel: string
): ReturnType<typeof generateWeeklyNarrative> {
  return {
    ...narrative,
    headline: replaceIsoWeekIds(narrative.headline, weekRangeLabel),
    summary_text: replaceIsoWeekIds(narrative.summary_text, weekRangeLabel),
    key_drivers: narrative.key_drivers.map((driver) => replaceIsoWeekIds(driver, weekRangeLabel)),
    manager_ready_summary: replaceIsoWeekIds(narrative.manager_ready_summary, weekRangeLabel)
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function removeSeededWorkBlocks(blocks: WorkBlock[]) {
  return blocks.filter((block) => !/^wb-\d{3}$/.test(block.work_block_id));
}

function removeSeededCorrections(corrections: UserCorrection[]) {
  return corrections.filter((correction) => !/^wb-\d{3}$/.test(correction.work_block_id));
}

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function fieldLabel(field: UserCorrection["field"]) {
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
    calendar_import: "Calendar import"
  };

  return labels[field];
}

function auditTypeLabel(type: AuditEventType) {
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

function createAuditEvent(input: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string }): AuditEvent {
  return {
    ...input,
    event_id: crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString()
  };
}

function AppShell({
  active,
  setActive,
  toolbarActions,
  toolbarStatus,
  snapshot,
  hasWorkBlocks,
  paused,
  setPaused,
  sidebarCollapsed,
  setSidebarCollapsed,
  windowMode,
  setWindowMode,
  children
}: {
  active: Screen;
  setActive: (screen: Screen) => void;
  toolbarActions: AppToolbarAction[];
  toolbarStatus: string;
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  hasWorkBlocks: boolean;
  paused: boolean;
  setPaused: (value: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  windowMode: WindowMode;
  setWindowMode: (value: WindowMode) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${windowMode === "compact" ? "is-compact-widget" : ""}`}>
      <AppToolbar
        active={active}
        setActive={setActive}
        actions={toolbarActions}
        status={toolbarStatus}
        paused={paused}
        setPaused={setPaused}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        windowMode={windowMode}
        setWindowMode={setWindowMode}
      />
      {windowMode === "large" && (
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">cc</div>
          <div>
            <strong>ClearCapacity</strong>
            <span>Explainable analyst capacity</span>
          </div>
        </div>
        <nav className="nav-list">
          {screens.map((screen) => {
            const Icon = screen.icon;
            return (
              <button
                className={active === screen.id ? "nav-item is-active" : "nav-item"}
                key={screen.id}
                onClick={() => setActive(screen.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{screen.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="side-metric">
          <span>Reliable new-work capacity</span>
          <strong>{hasWorkBlocks ? pct(snapshot.reliable_new_work_capacity_pct) : "--"}</strong>
          <small>{hasWorkBlocks ? "of next week" : "needs local signal"}</small>
        </div>
        <button className={paused ? "pause-button is-paused" : "pause-button"} type="button" onClick={() => setPaused(!paused)}>
          {paused ? <Moon size={18} /> : <Pause size={18} />}
          <span>{paused ? "Private mode on" : "Pause tracking"}</span>
        </button>
      </aside>
      )}
      <main className="main-panel">{children}</main>
    </div>
  );
}

function AppToolbar({
  active,
  setActive,
  actions,
  status,
  paused,
  setPaused,
  sidebarCollapsed,
  setSidebarCollapsed,
  windowMode,
  setWindowMode
}: {
  active: Screen;
  setActive: (screen: Screen) => void;
  actions: AppToolbarAction[];
  status: string;
  paused: boolean;
  setPaused: (value: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  windowMode: WindowMode;
  setWindowMode: (value: WindowMode) => void;
}) {
  function startToolbarDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) {
      return;
    }

    void getCurrentWindow().startDragging();
  }

  return (
    <header className="app-toolbar" onPointerDown={startToolbarDrag}>
      <div className="toolbar-left">
        {windowMode === "large" && (
          <button
            className="chrome-button"
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <PanelLeft size={15} />
          </button>
        )}
        <div className="toolbar-title">
          <strong>ClearCapacity</strong>
          <span>{paused ? "Private mode on" : status}</span>
        </div>
      </div>

      {windowMode === "large" && (
        <nav className="toolbar-tabs" aria-label="Primary views">
          {screens.map((screen) => {
            const Icon = screen.icon;
            return (
              <button
                aria-label={screen.label}
                className={active === screen.id ? "is-active" : ""}
                data-label={screen.label}
                key={screen.id}
                type="button"
                onClick={() => setActive(screen.id)}
                title={screen.label}
              >
                <Icon size={15} />
                <span>{screen.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="toolbar-drag-region" />

      <div className="toolbar-actions">
        {windowMode === "large" &&
          actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                className={`toolbar-action ${action.tone ?? "default"}`}
                disabled={action.disabled}
                key={action.label}
                type="button"
                onClick={action.onClick}
                title={action.label}
              >
                <Icon size={15} />
                <span>{action.label}</span>
              </button>
            );
          })}
        <button
          className={paused ? "chrome-button is-paused" : "chrome-button"}
          type="button"
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume tracking" : "Pause tracking"}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          className="chrome-button"
          type="button"
          onClick={() => setWindowMode(windowMode === "compact" ? "large" : "compact")}
          title={windowMode === "compact" ? "Use large window" : "Use compact widget"}
        >
          {windowMode === "compact" ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
      </div>
    </header>
  );
}

function SetupScreen({
  paused,
  setPaused,
  visualContextEnabled,
  setVisualContextEnabled,
  visualContextInsights,
  calendarEvents,
  activeWindowSamples,
  activeWindowSessions,
  captureError,
  importError,
  onImportOutlookIcs
}: {
  paused: boolean;
  setPaused: (value: boolean) => void;
  visualContextEnabled: boolean;
  setVisualContextEnabled: (value: boolean) => void;
  visualContextInsights: VisualContextInsight[];
  calendarEvents: OutlookCalendarEvent[];
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  captureError: string | null;
  importError: string | null;
  onImportOutlookIcs: (file: File) => void;
}) {
  const latestImport = calendarEvents.reduce<string | null>((latest, event) => {
    if (!latest || new Date(event.imported_at) > new Date(latest)) {
      return event.imported_at;
    }
    return latest;
  }, null);
  const visualCapturesToday = visualContextInsights.filter((insight) => getLocalDateKey(new Date(insight.captured_at)) === getLocalDateKey()).length;

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Setup and permissions</p>
          <h1>Start with trust, then collect only useful metadata.</h1>
        </div>
        <button className="primary-action" type="button" onClick={() => setPaused(!paused)}>
          {paused ? <Moon size={18} /> : <Pause size={18} />}
          <span>{paused ? "Resume" : "Private mode"}</span>
        </button>
      </div>

      <div className="trust-band">
        <div>
          <Lock size={20} />
          <strong>Raw events stay local by default</strong>
          <span>Screenshot analysis is opt-in. No keystrokes, webcam signals, or hidden manager access.</span>
        </div>
        <div>
          <Eye size={20} />
          <strong>User reviews before sharing</strong>
          <span>Exports are manager-ready summaries, not surveillance feeds.</span>
        </div>
        <div>
          <Settings size={20} />
          <strong>Every source is adjustable</strong>
          <span>Pause, exclude, relabel, and keep sensitive blocks private.</span>
        </div>
      </div>

      <div className="settings-grid">
        {sources.map((source) => (
          <label className="setting-row" key={source.label}>
            <input type="checkbox" defaultChecked={source.enabled} />
            <span>
              <strong>{source.label}</strong>
              <small>{source.detail}</small>
            </span>
          </label>
        ))}
      </div>

      <section className="integration-panel">
        <div>
          <p className="eyebrow">Outlook calendar</p>
          <h2>Import meetings from an Outlook .ics export.</h2>
          <p>
            ClearCapacity parses the file locally, creates fixed meeting blocks, and uses them in weekly
            capacity. No email body or meeting notes are imported.
          </p>
        </div>
        <label className="file-import-button">
          <Upload size={17} />
          <span>Import .ics</span>
          <input
            accept=".ics,text/calendar"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImportOutlookIcs(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </label>
        <div className="integration-status">
          <strong>{calendarEvents.length}</strong>
          <span>Outlook events imported</span>
          {latestImport && <small>Last import {formatAuditTime(latestImport)}</small>}
          {importError && <small className="import-error">{importError}</small>}
        </div>
      </section>

      <section className="integration-panel">
        <div>
          <p className="eyebrow">Active window metadata</p>
          <h2>Capture foreground app and window title locally.</h2>
          <p>
            The native sampler records app name, front window title, and timestamps only. Pause tracking
            stops new samples immediately. No screenshots, keystrokes, or content capture.
          </p>
        </div>
        <button className={paused ? "file-import-button is-muted" : "file-import-button"} type="button" onClick={() => setPaused(!paused)}>
          {paused ? <Moon size={17} /> : <Monitor size={17} />}
          <span>{paused ? "Resume capture" : "Pause capture"}</span>
        </button>
        <div className="integration-status">
          <strong>{activeWindowSessions.length}</strong>
          <span>local sessions grouped</span>
          <small>{activeWindowSamples.length} active-window samples stored</small>
          {captureError && <small className="import-error">{captureError}</small>}
        </div>
      </section>

      <section className="integration-panel">
        <div>
          <p className="eyebrow">Visual context</p>
          <h2>Smart occasional screenshot analysis.</h2>
          <p>
            When enabled, ClearCapacity can capture at most {MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY} screenshots per day
            during sustained work sessions, send them to OpenAI for a derived insight, then delete the raw image.
            Private mode stops new captures.
          </p>
        </div>
        <button
          className={visualContextEnabled ? "file-import-button" : "file-import-button is-muted"}
          type="button"
          onClick={() => setVisualContextEnabled(!visualContextEnabled)}
        >
          {visualContextEnabled ? <Eye size={17} /> : <Moon size={17} />}
          <span>{visualContextEnabled ? "Enabled" : "Disabled"}</span>
        </button>
        <div className="integration-status">
          <strong>{visualCapturesToday}</strong>
          <span>visual captures today</span>
          <small>{MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY - visualCapturesToday} remaining before daily cap</small>
        </div>
      </section>
    </section>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const level = value >= 0.85 ? "High" : value >= 0.74 ? "Medium" : "Needs review";
  return <span className={`confidence ${level === "Needs review" ? "low" : level.toLowerCase()}`}>{level} {Math.round(value * 100)}%</span>;
}

function BlockCard({
  block,
  onConfirm,
  onExclude,
  onRelabel
}: {
  block: WorkBlock;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: <K extends keyof WorkBlock>(blockId: string, field: K, value: WorkBlock[K]) => void;
}) {
  return (
    <article className={block.user_verified ? "block-card verified" : "block-card"}>
      <div className="block-topline">
        <span>{formatRange(block)}</span>
        <ConfidenceChip value={block.confidence} />
      </div>
      <div className="block-main">
        <div>
          <h3>{block.project_name}</h3>
          <p>{block.stakeholder_group}</p>
        </div>
        <strong>{pct(block.estimated_capacity_pct)}</strong>
      </div>
      <div className="tag-grid">
        <select value={block.category} onChange={(event) => onRelabel(block.work_block_id, "category", event.target.value as WorkCategory)}>
          {workCategories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <select value={block.planned_status} onChange={(event) => onRelabel(block.work_block_id, "planned_status", event.target.value as PlannedStatus)}>
          {plannedStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select value={block.mode} onChange={(event) => onRelabel(block.work_block_id, "mode", event.target.value as WorkMode)}>
          {workModes.map((mode) => (
            <option key={mode}>{mode}</option>
          ))}
        </select>
      </div>
      <details className="evidence">
        <summary>Why this estimate?</summary>
        <ul>
          {block.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      <div className="block-actions">
        <button type="button" onClick={() => onConfirm(block.work_block_id)}>
          <Check size={16} />
          <span>Confirm</span>
        </button>
        <button type="button">
          <SplitSquareHorizontal size={16} />
          <span>Split</span>
        </button>
        <button type="button" onClick={() => onExclude(block.work_block_id)}>
          <X size={16} />
          <span>Exclude</span>
        </button>
      </div>
    </article>
  );
}

function LedgerScreen({
  blocks,
  activeWindowSamples,
  activeWindowSessions,
  visualContextInsights,
  captureError,
  classificationStatus,
  classificationError,
  visualContextStatus,
  visualContextError,
  paused,
  onClassifySessions,
  onConfirm,
  onExclude,
  onRelabel
}: {
  blocks: WorkBlock[];
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  visualContextInsights: VisualContextInsight[];
  captureError: string | null;
  classificationStatus: "idle" | "classifying" | "error";
  classificationError: string | null;
  visualContextStatus: "idle" | "capturing" | "error";
  visualContextError: string | null;
  paused: boolean;
  onClassifySessions: () => void;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: <K extends keyof WorkBlock>(blockId: string, field: K, value: WorkBlock[K]) => void;
}) {
  const classifiedSessionIds = new Set(blocks.flatMap((block) => block.derived_from));
  const unclassifiedSessionCount = activeWindowSessions.filter(
    (session) => !classifiedSessionIds.has(session.session_id) && session.sample_count >= 2
  ).length;
  const current = blocks[7] ?? blocks[0];
  return (
    <section className="screen">
      <div className="screen-header compact">
        <div>
          <p className="eyebrow">Live work ledger</p>
          <h1>Explainable inferred work blocks.</h1>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input aria-label="Search work blocks" placeholder="Search project, stakeholder, category" />
        </div>
      </div>
      {current && (
        <section className="current-block">
          <div>
            <p className="eyebrow">Current block</p>
            <h2>{current.project_name}</h2>
            <span>{compactCategory(current.category)} · {current.mode}</span>
          </div>
          <div className="pulse-meter">
            <TimerReset size={20} />
            <strong>{pct(current.estimated_capacity_pct)}</strong>
          </div>
        </section>
      )}
      <ActivityCapturePanel
        activeWindowSamples={activeWindowSamples}
        activeWindowSessions={activeWindowSessions}
        visualContextInsights={visualContextInsights}
        captureError={captureError}
        classificationStatus={classificationStatus}
        classificationError={classificationError}
        visualContextStatus={visualContextStatus}
        visualContextError={visualContextError}
        unclassifiedSessionCount={unclassifiedSessionCount}
        paused={paused}
        onClassifySessions={onClassifySessions}
      />
      {blocks.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No work blocks yet."
          description="ClearCapacity now starts empty. Import an Outlook .ics export or let active-window capture build local sessions, then use Classify sessions to draft reviewable work blocks."
        />
      ) : (
        <div className="ledger-list">
          {blocks.map((block) => (
            <BlockCard
              block={block}
              key={block.work_block_id}
              onConfirm={onConfirm}
              onExclude={onExclude}
              onRelabel={onRelabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityCapturePanel({
  activeWindowSamples,
  activeWindowSessions,
  visualContextInsights,
  captureError,
  classificationStatus,
  classificationError,
  visualContextStatus,
  visualContextError,
  unclassifiedSessionCount,
  paused,
  onClassifySessions
}: {
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  visualContextInsights: VisualContextInsight[];
  captureError: string | null;
  classificationStatus: "idle" | "classifying" | "error";
  classificationError: string | null;
  visualContextStatus: "idle" | "capturing" | "error";
  visualContextError: string | null;
  unclassifiedSessionCount: number;
  paused: boolean;
  onClassifySessions: () => void;
}) {
  const latestSample = activeWindowSamples[activeWindowSamples.length - 1];
  const latestSessionSummaries = summarizeRecentSessions(activeWindowSessions);

  return (
    <section className="activity-capture-panel">
      <div className="section-title">
        <div>
          <h2>Live local capture</h2>
          <span>{paused ? "Paused" : "Foreground app/window metadata only"}</span>
        </div>
        <div className="capture-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={classificationStatus === "classifying" || unclassifiedSessionCount === 0}
            onClick={onClassifySessions}
          >
            <RefreshCw size={16} />
            <span>{classificationStatus === "classifying" ? "Classifying" : "Classify sessions"}</span>
          </button>
          <ConfidenceChip value={captureError ? 0.4 : paused ? 0.72 : 0.9} />
        </div>
      </div>
      <div className="capture-grid">
        <div className="capture-stat">
          <span>Current app</span>
          <strong>{paused ? "Paused" : latestSample?.app_name ?? "Waiting"}</strong>
          <small>{latestSample?.window_title ?? "No active-window sample yet"}</small>
        </div>
        <div className="capture-stat">
          <span>Samples</span>
          <strong>{activeWindowSamples.length}</strong>
          <small>stored locally</small>
        </div>
        <div className="capture-stat">
          <span>Sessions</span>
          <strong>{activeWindowSessions.length}</strong>
          <small>{unclassifiedSessionCount} ready for AI classification</small>
        </div>
        <div className="capture-stat">
          <span>Visual context</span>
          <strong>{visualContextInsights.length}</strong>
          <small>derived insights, raw images deleted</small>
        </div>
      </div>
      {captureError && <p className="capture-error">{captureError}</p>}
      {classificationError && <p className="capture-error">{classificationError}</p>}
      {visualContextStatus === "capturing" && <p className="capture-note">Visual context capture is deriving a local insight.</p>}
      {visualContextError && <p className="capture-error">{visualContextError}</p>}
      {latestSessionSummaries.length > 0 && (
        <div className="session-list">
          {latestSessionSummaries.map((session) => (
            <div key={session.app_name}>
              <span>{session.app_name}</span>
              <strong>{session.duration_minutes} min</strong>
              <small>
                {session.window_title ?? "Window title unavailable"}
                {session.session_count > 1 ? ` · ${session.session_count} session fragments combined` : ""}
              </small>
            </div>
          ))}
        </div>
      )}
      {visualContextInsights.length > 0 && (
        <div className="session-list">
          {visualContextInsights.slice(-3).reverse().map((insight) => (
            <div key={insight.insight_id}>
              <span>{insight.visible_tool ?? insight.app_name}</span>
              <strong>{Math.round(insight.confidence * 100)}%</strong>
              <small>{insight.activity_summary}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DailyReviewScreen({
  blocks,
  corrections,
  reviewSuggestions,
  reviewCopilotStatus,
  reviewCopilotError,
  onGenerateReviewSuggestions,
  onApplyReviewSuggestion,
  onDismissReviewSuggestion,
  onConfirm,
  onExclude,
  onRelabel,
  onResetLocalData
}: {
  blocks: WorkBlock[];
  corrections: UserCorrection[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  reviewCopilotStatus: "idle" | "generating" | "error";
  reviewCopilotError: string | null;
  onGenerateReviewSuggestions: () => void;
  onApplyReviewSuggestion: (suggestion: ReviewCopilotSuggestion) => void;
  onDismissReviewSuggestion: (suggestionId: string) => void;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: <K extends keyof WorkBlock>(blockId: string, field: K, value: WorkBlock[K]) => void;
  onResetLocalData: () => void;
}) {
  const reviewQueue = blocks.filter((block) => !block.user_verified);
  return (
    <section className="screen">
      <div className="screen-header compact">
        <div>
          <p className="eyebrow">Daily review</p>
          <h1>
            {blocks.length === 0
              ? "Nothing to review yet."
              : reviewQueue.length === 0
                ? "All local work blocks are reviewed."
                : `${reviewQueue.length} blocks need a quick look.`}
          </h1>
        </div>
        {reviewQueue.length > 0 && (
          <button className="primary-action" type="button" onClick={() => reviewQueue.forEach((block) => onConfirm(block.work_block_id))}>
            <Check size={18} />
            <span>Confirm all visible</span>
          </button>
        )}
      </div>
      <div className="review-layout">
        <div className="review-rail">
          <strong>Under 2 minutes</strong>
          <span>Confirm the obvious blocks, relabel the weird ones, exclude anything sensitive.</span>
          <div className="review-stat">
            <small>Verified</small>
            <b>{blocks.filter((block) => block.user_verified).length}/{blocks.length}</b>
          </div>
          <CorrectionHistory blocks={blocks} corrections={corrections} onResetLocalData={onResetLocalData} />
          <ReviewCopilotPanel
            reviewQueueCount={reviewQueue.length}
            suggestions={reviewSuggestions}
            status={reviewCopilotStatus}
            error={reviewCopilotError}
            onGenerate={onGenerateReviewSuggestions}
            onApply={onApplyReviewSuggestion}
            onDismiss={onDismissReviewSuggestion}
          />
        </div>
        {blocks.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No review queue."
            description="Once Outlook meetings or inferred active-window work blocks exist, this view becomes the fast correction loop for confirming, relabeling, splitting, and excluding local records."
          />
        ) : reviewQueue.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Everything visible is confirmed."
            description="New Outlook imports and active-window-derived blocks will appear here when they need your review."
          />
        ) : (
          <div className="ledger-list">
            {reviewQueue.map((block) => (
              <BlockCard
                block={block}
                key={block.work_block_id}
                onConfirm={onConfirm}
                onExclude={onExclude}
                onRelabel={onRelabel}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CorrectionHistory({
  blocks,
  corrections,
  onResetLocalData
}: {
  blocks: WorkBlock[];
  corrections: UserCorrection[];
  onResetLocalData: () => void;
}) {
  const recentCorrections = [...corrections]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 8);

  return (
    <section className="history-panel">
      <div className="history-title">
        <span>
          <History size={16} />
          <strong>Correction history</strong>
        </span>
        <button type="button" onClick={onResetLocalData} title="Reset local prototype data">
          <RotateCcw size={15} />
        </button>
      </div>
      {recentCorrections.length === 0 ? (
        <p>No corrections yet.</p>
      ) : (
        <ol className="history-list">
          {recentCorrections.map((correction) => {
            const block = blocks.find((candidate) => candidate.work_block_id === correction.work_block_id);
            const label = block?.project_name ?? correction.old_value;

            return (
              <li key={correction.correction_id}>
                <div>
                  <strong>{fieldLabel(correction.field)}</strong>
                  <time>{formatAuditTime(correction.timestamp)}</time>
                </div>
                <span>{label}</span>
                <small>{correction.old_value} → {correction.new_value}</small>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ReviewCopilotPanel({
  reviewQueueCount,
  suggestions,
  status,
  error,
  onGenerate,
  onApply,
  onDismiss
}: {
  reviewQueueCount: number;
  suggestions: ReviewCopilotSuggestion[];
  status: "idle" | "generating" | "error";
  error: string | null;
  onGenerate: () => void;
  onApply: (suggestion: ReviewCopilotSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}) {
  return (
    <section className="copilot-panel">
      <div className="history-title">
        <span>
          <RefreshCw size={16} />
          <strong>Review Copilot</strong>
        </span>
        <button
          className="copilot-generate"
          type="button"
          disabled={status === "generating" || reviewQueueCount === 0}
          onClick={onGenerate}
          title="Generate review suggestions"
        >
          <RefreshCw size={15} />
          <span>{status === "generating" ? "Thinking" : "Suggest"}</span>
        </button>
      </div>
      <p>Suggests cleanup actions for unverified blocks. You approve every change.</p>
      {error && <p className="copilot-error">{error}</p>}
      {suggestions.length === 0 ? (
        <span className="copilot-empty">
          {status === "generating" ? "Generating suggestions..." : "No suggestions yet."}
        </span>
      ) : (
        <ol className="copilot-list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.suggestion_id}>
              <div>
                <strong>{suggestion.title}</strong>
                <span>{suggestion.action} · {Math.round(suggestion.confidence * 100)}%</span>
              </div>
              <p>{suggestion.rationale}</p>
              <small>{suggestion.work_block_ids.length} block{suggestion.work_block_ids.length === 1 ? "" : "s"}</small>
              <div className="copilot-actions">
                <button type="button" onClick={() => onApply(suggestion)}>Apply</button>
                <button type="button" onClick={() => onDismiss(suggestion.suggestion_id)}>Dismiss</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StackedBar({ snapshot }: { snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot> }) {
  return (
    <div className="stacked-bar" aria-label="Capacity category allocation">
      {snapshot.category_allocation.map((item) => (
        <span
          key={item.label}
          style={{
            width: `${item.value}%`,
            background: categoryColors[item.label]
          }}
          title={`${item.label}: ${item.value}%`}
        />
      ))}
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{typeof value === "number" ? pct(value) : value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="empty-state">
      <div className="empty-state-icon">
        <Icon size={20} />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children && <div className="empty-state-actions">{children}</div>}
    </section>
  );
}

function summarizeRecentSessions(sessions: ActivitySession[], limit = 4) {
  const summaries = new Map<
    string,
    {
      app_name: string;
      window_title: string | null;
      duration_minutes: number;
      session_count: number;
      latest_start_time: string;
    }
  >();

  sessions.slice(0, 12).forEach((session) => {
    const existing = summaries.get(session.app_name);
    if (!existing) {
      summaries.set(session.app_name, {
        app_name: session.app_name,
        window_title: session.window_title,
        duration_minutes: session.duration_minutes,
        session_count: 1,
        latest_start_time: session.start_time
      });
      return;
    }

    const sessionIsNewer = new Date(session.start_time) > new Date(existing.latest_start_time);
    summaries.set(session.app_name, {
      app_name: session.app_name,
      window_title: sessionIsNewer ? session.window_title : existing.window_title,
      duration_minutes: existing.duration_minutes + session.duration_minutes,
      session_count: existing.session_count + 1,
      latest_start_time: sessionIsNewer ? session.start_time : existing.latest_start_time
    });
  });

  return [...summaries.values()]
    .sort((left, right) => new Date(right.latest_start_time).getTime() - new Date(left.latest_start_time).getTime())
    .slice(0, limit);
}

function WeeklyCapacityScreen({
  snapshot,
  weekRangeLabel,
  nextWeekRangeLabel,
  generatedForecast,
  forecastStatus,
  forecastError,
  onGenerateForecast,
  hasWorkBlocks
}: {
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  weekRangeLabel: string;
  nextWeekRangeLabel: string;
  generatedForecast: PersistedForecastRecord | null;
  forecastStatus: "idle" | "generating" | "error";
  forecastError: string | null;
  onGenerateForecast: () => void;
  hasWorkBlocks: boolean;
}) {
  if (!hasWorkBlocks) {
    return (
      <section className="screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly capacity view</p>
            <h1>{weekRangeLabel}: waiting for real workload signal.</h1>
          </div>
          <div className="summary-score">
            <span>Summary confidence</span>
            <strong>--</strong>
          </div>
        </div>
        <EmptyState
          icon={BarChart3}
          title="No weekly capacity model yet."
          description="The percentage breakdown will stay blank until local sources create work blocks. Import Outlook calendar events now, then let active-window sessions become the next inference source."
        />
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Weekly capacity view</p>
          <h1>{weekRangeLabel}: {pct(snapshot.reliable_new_work_capacity_pct)} reliable capacity for new planned work.</h1>
        </div>
        <div className="header-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={forecastStatus === "generating"}
            onClick={onGenerateForecast}
          >
            <RefreshCw size={17} />
            <span>{forecastStatus === "generating" ? "Forecasting" : "Forecast next week"}</span>
          </button>
          <div className="summary-score">
            <span>Summary confidence</span>
            <strong>{Math.round(snapshot.summary_confidence * 100)}%</strong>
          </div>
        </div>
      </div>

      <div className="hero-metrics">
        <MetricCard label="Allocated capacity" value={snapshot.allocated_pct} helper="Estimated distribution this week" />
        <MetricCard label="Effective planned work" value={snapshot.planned_pct} helper="Capacity spent on planned work" />
        <MetricCard label="Reactive load" value={snapshot.reactive_pct} helper="Unplanned support and interruption work" />
        <MetricCard label="Reliable new work" value={snapshot.reliable_new_work_capacity_pct} helper="Forecast for next week" />
      </div>

      <ForecastAgentPanel
        generatedForecast={generatedForecast}
        nextWeekRangeLabel={nextWeekRangeLabel}
        status={forecastStatus}
        error={forecastError}
        deterministicReliableCapacity={snapshot.reliable_new_work_capacity_pct}
        onGenerate={onGenerateForecast}
      />

      <section className="capacity-section">
        <div className="section-title">
          <h2>100% weekly capacity model</h2>
          <span>standard 40-hour baseline</span>
        </div>
        <StackedBar snapshot={snapshot} />
        <div className="allocation-grid">
          {snapshot.category_allocation.map((item) => (
            <div className="allocation-row" key={item.label}>
              <span className="dot" style={{ background: categoryColors[item.label] }} />
              <span>{item.label}</span>
              <strong>{pct(item.value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="two-column">
        <section className="capacity-section">
          <div className="section-title">
            <h2>Planned vs reactive</h2>
            <span>politics-to-math translator</span>
          </div>
          <div className="comparison-bars">
            <BarLine label="Planned" value={snapshot.planned_pct} tone="blue" />
            <BarLine label="Reactive" value={snapshot.reactive_pct} tone="red" />
            <BarLine label="Fixed / recurring" value={snapshot.recurring_pct} tone="teal" />
            <BarLine label="Blocked" value={snapshot.blocked_pct} tone="purple" />
          </div>
        </section>
        <section className="capacity-section">
          <div className="section-title">
            <h2>Delivery risk modifiers</h2>
            <span>forecast inputs</span>
          </div>
          <div className="risk-list">
            <RiskRow label="Context switch burden" value={snapshot.context_switch_score} />
            <RiskRow label="WIP overload" value={snapshot.wip_load_score} />
            <RiskRow label="Carryover risk" value={snapshot.carryover_risk_pct / 40} />
            <RiskRow label="Meeting density" value={snapshot.meeting_pct / 35} />
          </div>
        </section>
      </div>
    </section>
  );
}

function ForecastAgentPanel({
  generatedForecast,
  nextWeekRangeLabel,
  status,
  error,
  deterministicReliableCapacity,
  onGenerate
}: {
  generatedForecast: PersistedForecastRecord | null;
  nextWeekRangeLabel: string;
  status: "idle" | "generating" | "error";
  error: string | null;
  deterministicReliableCapacity: number;
  onGenerate: () => void;
}) {
  const forecast = generatedForecast?.forecast;

  return (
    <section className="capacity-section forecast-panel">
      <div className="section-title">
        <div>
          <h2>Forecast Agent</h2>
          <span>{forecast ? `Generated ${formatAuditTime(generatedForecast.generated_at)}` : `Next week: ${nextWeekRangeLabel}`}</span>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={status === "generating"}
          onClick={onGenerate}
        >
          <RefreshCw size={16} />
          <span>{status === "generating" ? "Forecasting" : forecast ? "Regenerate" : "Generate"}</span>
        </button>
      </div>
      {error && <p className="forecast-error">{error}</p>}
      {!forecast ? (
        <div className="forecast-empty">
          <strong>No AI forecast yet.</strong>
          <span>
            The deterministic estimate is {pct(deterministicReliableCapacity)}. Generate a forecast to add assumptions,
            constraints, scenarios, and planning recommendations.
          </span>
        </div>
      ) : (
        <>
          <div className="forecast-summary">
            <div>
              <span>Reliable new-work capacity</span>
              <strong>{pct(forecast.reliable_new_work_capacity_pct)}</strong>
              <small>{Math.round(forecast.confidence * 100)}% forecast confidence</small>
            </div>
            <div>
              <span>Conservative</span>
              <strong>{pct(forecast.conservative_capacity_pct)}</strong>
              <small>protected planning case</small>
            </div>
            <div>
              <span>Likely</span>
              <strong>{pct(forecast.likely_capacity_pct)}</strong>
              <small>expected case</small>
            </div>
            <div>
              <span>Optimistic</span>
              <strong>{pct(forecast.optimistic_capacity_pct)}</strong>
              <small>if risks clear</small>
            </div>
          </div>
          <div className="forecast-copy">
            <h3>{forecast.headline}</h3>
            <p>{forecast.summary_text}</p>
          </div>
          <div className="forecast-grid">
            <ForecastList title="Constraints" items={forecast.key_constraints} />
            <ForecastList title="Risk flags" items={forecast.risk_flags} />
            <ForecastList title="Recommended actions" items={forecast.recommended_actions} />
            <ForecastList title="Assumptions" items={forecast.assumptions} />
          </div>
        </>
      )}
    </section>
  );
}

function ForecastList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="forecast-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function BarLine({ label, value, tone }: { label: string; value: number; tone: "blue" | "red" | "teal" | "purple" }) {
  return (
    <div className="bar-line">
      <div>
        <span>{label}</span>
        <strong>{pct(value)}</strong>
      </div>
      <div className="bar-track">
        <span className={tone} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: number }) {
  const bounded = Math.max(0, Math.min(1, value));
  return (
    <div className="risk-row">
      <span>{label}</span>
      <div className="risk-track">
        <span style={{ width: `${bounded * 100}%` }} />
      </div>
      <strong>{Math.round(bounded * 100)}</strong>
    </div>
  );
}

function NarrativeScreen({
  narrative,
  generatedNarrative,
  weekRangeLabel,
  hasNarrativeEvidence,
  generationStatus,
  generationError,
  managerSummaryText,
  onManagerSummaryChange,
  onRegenerate
}: {
  narrative: ReturnType<typeof generateWeeklyNarrative>;
  generatedNarrative: PersistedNarrativeRecord | null;
  weekRangeLabel: string;
  hasNarrativeEvidence: boolean;
  generationStatus: "idle" | "generating" | "error";
  generationError: string | null;
  managerSummaryText: string | null;
  onManagerSummaryChange: (value: string) => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const displayNarrative = displaySafeNarrative(generatedNarrative?.narrative ?? narrative, weekRangeLabel);
  const generatedManagerText = `${displayNarrative.headline}\n\n${displayNarrative.manager_ready_summary}`;
  const managerText = replaceIsoWeekIds(managerSummaryText ?? generatedManagerText, weekRangeLabel);

  if (!hasNarrativeEvidence) {
    return (
      <section className="screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly narrative</p>
            <h1>No manager summary until the week has local evidence.</h1>
          </div>
        </div>
        <EmptyState
          icon={FileText}
          title="Narrative generation is waiting."
          description="ClearCapacity will generate analyst and manager-ready text after Outlook imports or active-window-derived work blocks create enough explainable workload evidence."
        />
      </section>
    );
  }

  if (!generatedNarrative) {
    return (
      <section className="screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly narrative</p>
            <h1>Generate an OpenAI-backed weekly narrative.</h1>
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={generationStatus === "generating"}
            onClick={onRegenerate}
          >
            <RefreshCw size={18} />
            <span>{generationStatus === "generating" ? "Generating" : "Generate now"}</span>
          </button>
        </div>
        <EmptyState
          icon={FileText}
          title="Ready to generate."
          description="The prompt will include the current ledger, daily review corrections, weekly capacity metrics, Outlook imports, and active-window session context. It is sent to OpenAI only when generation runs."
        />
        {generationError && <p className="narrative-error">{generationError}</p>}
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Weekly narrative</p>
          <h1>{displayNarrative.headline}</h1>
        </div>
        <div className="narrative-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={generationStatus === "generating"}
            onClick={onRegenerate}
          >
            <RefreshCw size={17} />
            <span>{generationStatus === "generating" ? "Generating" : "Regenerate"}</span>
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(managerText);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            <ClipboardCopy size={18} />
            <span>{copied ? "Copied" : "Copy summary"}</span>
          </button>
        </div>
      </div>
      <div className="narrative-status">
        <span>Generated {formatAuditTime(generatedNarrative.generated_at)}</span>
        <span>{generatedNarrative.model}</span>
        <span>{generatedNarrative.trigger === "auto" ? "daily automatic run" : "manual regeneration"}</span>
      </div>
      {generationError && <p className="narrative-error">{generationError}</p>}

      <div className="narrative-layout">
        <section className="narrative-panel">
          <div className="section-title">
            <h2>Analyst view</h2>
            <span>for 1:1 prep</span>
          </div>
          <p>{displayNarrative.summary_text}</p>
          <div className="driver-list">
            {displayNarrative.key_drivers.map((driver) => (
              <div key={driver}>
                <Tag size={16} />
                <span>{driver}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="narrative-panel manager">
          <div className="section-title">
            <h2>Manager-ready version</h2>
            <span>review before sharing</span>
          </div>
          <p>{displayNarrative.manager_ready_summary}</p>
          <div className="textarea-toolbar">
            <Pencil size={16} />
            <span>Edits save locally</span>
          </div>
          <textarea
            aria-label="Editable manager summary"
            value={managerText}
            onChange={(event) => onManagerSummaryChange(event.target.value)}
          />
        </section>
      </div>
    </section>
  );
}

function AuditLogScreen({ auditEvents }: { auditEvents: AuditEvent[] }) {
  type AuditFilter = "all" | "capture" | "session" | "visual" | "calendar" | "correction" | "classifier" | "copilot" | "forecast" | "narrative" | "privacy";
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [query, setQuery] = useState("");
  const filters: Array<{ id: AuditFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "capture", label: "Capture" },
    { id: "session", label: "Session" },
    { id: "visual", label: "Visual" },
    { id: "calendar", label: "Calendar" },
    { id: "correction", label: "Correction" },
    { id: "classifier", label: "Classifier" },
    { id: "copilot", label: "Copilot" },
    { id: "forecast", label: "Forecast" },
    { id: "narrative", label: "Narrative" },
    { id: "privacy", label: "Privacy" }
  ];
  const filterMatches: Record<AuditFilter, (event: AuditEvent) => boolean> = {
    all: () => true,
    capture: (event) => event.type === "active_window_sample",
    session: (event) => event.type === "activity_session",
    visual: (event) => event.type === "visual_context",
    calendar: (event) => event.type === "calendar_import",
    correction: (event) => event.type === "user_correction",
    classifier: (event) => event.type === "work_block_classification",
    copilot: (event) => event.type === "review_copilot",
    forecast: (event) => event.type === "forecast_agent",
    narrative: (event) => event.type === "narrative_generation",
    privacy: (event) => event.type === "privacy_pause" || event.type === "privacy_resume"
  };
  const filteredEvents = auditEvents
    .filter((event) => filterMatches[filter](event))
    .filter((event) => {
      const haystack = `${event.title} ${event.summary} ${event.source} ${JSON.stringify(event.details)}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  return (
    <section className="screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Audit log</p>
          <h1>Every local signal, inference, correction, and privacy event.</h1>
        </div>
        <div className="summary-score">
          <span>Local events</span>
          <strong>{auditEvents.length}</strong>
        </div>
      </div>

      <div className="audit-toolbar">
        <div className="audit-filters">
          {filters.map((item) => (
            <button
              className={filter === item.id ? "is-active" : ""}
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search audit log"
            placeholder="Search audit events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="audit-list">
        {filteredEvents.length === 0 ? (
          <section className="audit-empty">
            <strong>No audit events match.</strong>
            <span>Capture samples, imports, corrections, and privacy changes will appear here.</span>
          </section>
        ) : (
          filteredEvents.map((event) => <AuditEventRow event={event} key={event.event_id} />)
        )}
      </div>
    </section>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const [copied, setCopied] = useState(false);
  const detailsJson = JSON.stringify(event.details, null, 2);

  return (
    <details className="audit-row">
      <summary>
        <div>
          <span className={`audit-badge ${event.type}`}>{auditTypeLabel(event.type)}</span>
          <time>{formatAuditTime(event.timestamp)}</time>
        </div>
        <div>
          <strong>{event.title}</strong>
          <small>{event.summary}</small>
        </div>
        <span className="audit-privacy">{event.privacy_level}</span>
      </summary>
      <div className="audit-detail">
        <div className="audit-detail-header">
          <span>{event.source}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(event, null, 2));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            <ClipboardCopy size={15} />
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </div>
        <pre>{detailsJson}</pre>
      </div>
    </details>
  );
}

function CompactWidget({
  paused,
  activeWindowSamples,
  activeWindowSessions,
  visualContextInsights,
  auditEvents,
  generatedNarrative,
  narrative,
  weekRangeLabel,
  snapshot
}: {
  paused: boolean;
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  visualContextInsights: VisualContextInsight[];
  auditEvents: AuditEvent[];
  generatedNarrative: PersistedNarrativeRecord | null;
  narrative: ReturnType<typeof generateWeeklyNarrative>;
  weekRangeLabel: string;
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
}) {
  const latestSample = activeWindowSamples[activeWindowSamples.length - 1];
  const latestSession = activeWindowSessions[0];
  const latestInsight = [...visualContextInsights].sort(
    (left, right) => new Date(right.captured_at).getTime() - new Date(left.captured_at).getTime()
  )[0];
  const recentAuditEvents = [...auditEvents]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 6);
  const displayNarrative = displaySafeNarrative(generatedNarrative?.narrative ?? narrative, weekRangeLabel);
  const observation = paused
    ? "Tracking is paused. ClearCapacity is not collecting new active-window or visual context signals."
    : latestInsight
      ? `${latestInsight.visible_tool ?? latestInsight.app_name}: ${latestInsight.activity_summary}`
      : latestSample
        ? `Currently observing ${latestSample.app_name}${latestSample.window_title ? `, ${latestSample.window_title}` : ""}.`
        : "Waiting for the first local signal from active-window capture.";

  return (
    <section className="compact-widget">
      <section className="compact-hero">
        <div className="compact-status-line">
          <span className={paused ? "live-dot is-paused" : "live-dot"} />
          <span>{paused ? "Private mode" : "Live"}</span>
        </div>
        <div>
          <p>{paused ? "Capture paused" : "Now observing"}</p>
          <h1>{paused ? "Paused" : latestSample?.app_name ?? "Waiting"}</h1>
          <small>{latestSample?.window_title ?? "No active-window sample yet"}</small>
        </div>
        <div className="compact-capacity">
          <span>Reliable capacity</span>
          <strong>{snapshot.allocated_pct > 0 ? pct(snapshot.reliable_new_work_capacity_pct) : "--"}</strong>
        </div>
      </section>

      <div className="compact-center">
        <section className="compact-card compact-observation">
          <div className="compact-title">
            <Monitor size={15} />
            <span>Observation</span>
          </div>
          <p>{observation}</p>
          <div className="compact-metrics">
            <span>{activeWindowSamples.length} samples</span>
            <span>{activeWindowSessions.length} sessions</span>
            <span>{visualContextInsights.length} visual insights</span>
          </div>
        </section>

        <section className="compact-card compact-narrative">
          <div className="compact-title">
            <FileText size={15} />
            <span>Narrative</span>
          </div>
          <p>{generatedNarrative ? displayNarrative.headline : "No generated narrative yet. Local signal will shape this summary as capture continues."}</p>
        </section>
      </div>

      <div className="compact-stream">
        <section className="compact-card compact-sessions">
          <div className="compact-title">
            <Activity size={15} />
            <span>Sessions</span>
          </div>
          {activeWindowSessions.length === 0 ? (
            <p>No grouped sessions yet.</p>
          ) : (
            activeWindowSessions.slice(0, 3).map((session) => (
              <div className="compact-row" key={session.session_id}>
                <strong>{session.app_name}</strong>
                <span>{session.duration_minutes} min</span>
                <small>{session.window_title ?? "Window title unavailable"}</small>
              </div>
            ))
          )}
        </section>

        <section className="compact-card compact-audit">
          <div className="compact-title">
            <AlignLeft size={15} />
            <span>Audit stream</span>
          </div>
          {recentAuditEvents.length === 0 ? (
            <p>No audit events yet.</p>
          ) : (
            recentAuditEvents.map((event) => (
              <div className="compact-row" key={event.event_id}>
                <strong>{event.title}</strong>
                <span>{formatAuditTime(event.timestamp)}</span>
                <small>{event.summary}</small>
              </div>
            ))
          )}
        </section>
      </div>
    </section>
  );
}

export function App() {
  const [persistedSnapshot] = useState(() => readPersistedState());
  const currentWeekId = useMemo(() => getCurrentIsoWeekId(), []);
  const currentWeekRangeLabel = useMemo(() => getBusinessWeekRangeLabel(), []);
  const nextWeekId = useMemo(() => getCurrentIsoWeekId(addDays(new Date(), 7)), []);
  const nextWeekRangeLabel = useMemo(() => getBusinessWeekRangeLabel(addDays(new Date(), 7)), []);
  const initialBlocks = removeSeededWorkBlocks(persistedSnapshot?.blocks ?? []);
  const [active, setActive] = useState<Screen>("weekly");
  const [paused, setPaused] = useState(() => persistedSnapshot?.paused ?? false);
  const [blocks, setBlocks] = useState<WorkBlock[]>(() => initialBlocks);
  const [calendarEvents, setCalendarEvents] = useState<OutlookCalendarEvent[]>(
    () => persistedSnapshot?.calendarEvents ?? []
  );
  const [activeWindowSamples, setActiveWindowSamples] = useState<ActiveWindowSample[]>(
    () => persistedSnapshot?.activeWindowSamples ?? []
  );
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => persistedSnapshot?.auditEvents ?? []);
  const [corrections, setCorrections] = useState<UserCorrection[]>(
    () => removeSeededCorrections(persistedSnapshot?.corrections ?? [])
  );
  const [reviewSuggestions, setReviewSuggestions] = useState<ReviewCopilotSuggestion[]>(
    () => persistedSnapshot?.reviewSuggestions ?? []
  );
  const [generatedForecast, setGeneratedForecast] = useState<PersistedForecastRecord | null>(
    () => persistedSnapshot?.generatedForecast ?? null
  );
  const [visualContextEnabled, setVisualContextEnabled] = useState<boolean>(
    () => persistedSnapshot?.visualContextEnabled ?? false
  );
  const [visualContextInsights, setVisualContextInsights] = useState<VisualContextInsight[]>(
    () => persistedSnapshot?.visualContextInsights ?? []
  );
  const [managerSummaryText, setManagerSummaryText] = useState<string | null>(
    () => (initialBlocks.length > 0 || persistedSnapshot?.generatedNarrative ? persistedSnapshot?.managerSummaryText ?? null : null)
  );
  const [generatedNarrative, setGeneratedNarrative] = useState<PersistedNarrativeRecord | null>(
    () => persistedSnapshot?.generatedNarrative ?? null
  );
  const [lastNarrativeAutoRunDate, setLastNarrativeAutoRunDate] = useState<string | null>(
    () => persistedSnapshot?.lastNarrativeAutoRunDate ?? null
  );
  const [narrativeGenerationStatus, setNarrativeGenerationStatus] = useState<"idle" | "generating" | "error">("idle");
  const [narrativeGenerationError, setNarrativeGenerationError] = useState<string | null>(null);
  const [classificationStatus, setClassificationStatus] = useState<"idle" | "classifying" | "error">("idle");
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const [reviewCopilotStatus, setReviewCopilotStatus] = useState<"idle" | "generating" | "error">("idle");
  const [reviewCopilotError, setReviewCopilotError] = useState<string | null>(null);
  const [forecastStatus, setForecastStatus] = useState<"idle" | "generating" | "error">("idle");
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [visualContextStatus, setVisualContextStatus] = useState<"idle" | "capturing" | "error">("idle");
  const [visualContextError, setVisualContextError] = useState<string | null>(null);
  const [visualContextAttemptedSessionIds, setVisualContextAttemptedSessionIds] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [windowMode, setWindowMode] = useState<WindowMode>("large");

  const snapshot = useMemo(() => computeWeeklyCapacitySnapshot(currentWeekId, blocks), [blocks, currentWeekId]);
  const narrative = useMemo(() => generateWeeklyNarrative(snapshot), [snapshot]);
  const managerText = generatedNarrative
    ? replaceIsoWeekIds(
        managerSummaryText ?? `${generatedNarrative.narrative.headline}\n\n${generatedNarrative.narrative.manager_ready_summary}`,
        currentWeekRangeLabel
      )
    : "";
  const activeWindowSessions = useMemo(
    () => sessionizeActiveWindowSamples(activeWindowSamples),
    [activeWindowSamples]
  );
  const hasNarrativeEvidence = blocks.length > 0 || activeWindowSessions.length > 0 || calendarEvents.length > 0;
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const classifiedSessionIds = useMemo(() => new Set(blocks.flatMap((block) => block.derived_from)), [blocks]);
  const unclassifiedSessionCount = activeWindowSessions.filter(
    (session) => !classifiedSessionIds.has(session.session_id) && session.sample_count >= 2
  ).length;
  const reviewQueue = blocks.filter((block) => !block.user_verified);
  const toolbarStatus = blocks.length > 0
    ? `${pct(snapshot.reliable_new_work_capacity_pct)} reliable new-work capacity`
    : `${activeWindowSessions.length} sessions, ${calendarEvents.length} Outlook events`;
  const toolbarActions: AppToolbarAction[] = (() => {
    if (active === "setup") {
      return [
        {
          label: visualContextEnabled ? "Visual On" : "Visual Off",
          icon: visualContextEnabled ? Eye : Moon,
          onClick: () => setVisualContextEnabled(!visualContextEnabled)
        }
      ];
    }

    if (active === "ledger") {
      return [
        {
          label: classificationStatus === "classifying" ? "Classifying" : "Classify",
          icon: RefreshCw,
          onClick: () => void classifyActiveWindowSessions(),
          disabled: classificationStatus === "classifying" || unclassifiedSessionCount === 0,
          tone: "primary"
        }
      ];
    }

    if (active === "daily") {
      return [
        {
          label: reviewCopilotStatus === "generating" ? "Thinking" : "Review Copilot",
          icon: RefreshCw,
          onClick: () => void generateReviewCopilotSuggestions(),
          disabled: reviewCopilotStatus === "generating" || reviewQueue.length === 0,
          tone: "primary"
        },
        {
          label: "Confirm Visible",
          icon: Check,
          onClick: () => reviewQueue.forEach((block) => confirmBlock(block.work_block_id)),
          disabled: reviewQueue.length === 0
        }
      ];
    }

    if (active === "weekly") {
      return [
        {
          label: forecastStatus === "generating" ? "Forecasting" : "Forecast",
          icon: RefreshCw,
          onClick: () => void generateForecastAgent(),
          disabled: forecastStatus === "generating" || blocks.length === 0,
          tone: "primary"
        }
      ];
    }

    if (active === "narrative") {
      return [
        {
          label: narrativeGenerationStatus === "generating" ? "Generating" : generatedNarrative ? "Regenerate" : "Generate",
          icon: RefreshCw,
          onClick: () => void regenerateNarrative("manual"),
          disabled: narrativeGenerationStatus === "generating" || !hasNarrativeEvidence,
          tone: "primary"
        },
        {
          label: "Copy Summary",
          icon: ClipboardCopy,
          onClick: () => {
            if (managerText) {
              void navigator.clipboard?.writeText(managerText);
            }
          },
          disabled: !managerText
        }
      ];
    }

    return [];
  })();

  useEffect(() => {
    function navigateFromNative(event: Event) {
      const screen = (event as CustomEvent<Screen>).detail;
      if (screens.some((candidate) => candidate.id === screen)) {
        setActive(screen);
      }
    }

    function togglePauseFromNative() {
      setPaused((current) => !current);
    }

    window.addEventListener("clear-capacity:navigate", navigateFromNative);
    window.addEventListener("clear-capacity:toggle-pause", togglePauseFromNative);

    return () => {
      window.removeEventListener("clear-capacity:navigate", navigateFromNative);
      window.removeEventListener("clear-capacity:toggle-pause", togglePauseFromNative);
    };
  }, []);

  useEffect(() => {
    function copyManagerSummaryFromNative() {
      setActive("narrative");
      if (managerText) {
        void navigator.clipboard?.writeText(managerText);
      }
    }

    function resetLocalDataFromNative() {
      resetLocalData();
      setActive("daily");
    }

    window.addEventListener("clear-capacity:copy-manager-summary", copyManagerSummaryFromNative);
    window.addEventListener("clear-capacity:reset-local-data", resetLocalDataFromNative);

    return () => {
      window.removeEventListener("clear-capacity:copy-manager-summary", copyManagerSummaryFromNative);
      window.removeEventListener("clear-capacity:reset-local-data", resetLocalDataFromNative);
    };
  }, [managerText]);

  useEffect(() => {
    writePersistedState({
      version: 1,
      blocks,
      calendarEvents,
      activeWindowSamples,
      auditEvents,
      corrections,
      reviewSuggestions,
      generatedForecast,
      visualContextEnabled,
      visualContextInsights,
      managerSummaryText,
      generatedNarrative,
      lastNarrativeAutoRunDate,
      paused
    });
  }, [
    blocks,
    calendarEvents,
    activeWindowSamples,
    auditEvents,
    corrections,
    reviewSuggestions,
    generatedForecast,
    visualContextEnabled,
    visualContextInsights,
    managerSummaryText,
    generatedNarrative,
    lastNarrativeAutoRunDate,
    paused
  ]);

  useEffect(() => {
    void invoke("set_pause_menu_label", { paused }).catch(() => undefined);
    void invoke("set_activity_capture_paused", { paused }).catch(() => undefined);
  }, [paused]);

  useEffect(() => {
    if (windowMode === "compact") {
      setSidebarCollapsed(true);
    }
    void invoke("set_clear_capacity_window_mode", { mode: windowMode }).catch(() => undefined);
  }, [windowMode]);

  useEffect(() => {
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: paused ? "privacy_pause" : "privacy_resume",
        source: "privacy_control",
        title: paused ? "Tracking paused" : "Tracking resumed",
        summary: paused
          ? "Native active-window sampling was paused by the user."
          : "Native active-window sampling was resumed by the user.",
        privacy_level: "local_only",
        details: {
          paused,
          stored_locally: true,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }, [paused]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listen<NativeActiveWindowPayload>("clear-capacity:active-window-sample", (event) => {
      const payload = event.payload;

      if (payload.capture_error) {
        setCaptureError(payload.capture_error);
        return;
      }

      if (!payload.app_name) {
        return;
      }

      setCaptureError(null);
      setActiveWindowSamples((current) => {
        const sample: ActiveWindowSample = {
          sample_id: crypto.randomUUID(),
          timestamp: new Date(payload.timestamp_ms).toISOString(),
          app_name: payload.app_name ?? "Unknown app",
          window_title: payload.window_title || null,
          source_type: "macos_active_window",
          privacy_level: "local_only"
        };

        return [...current, sample].slice(-2000);
      });
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "active_window_sample",
          source: "macos_active_window",
          title: "Active-window sample captured",
          summary: `${payload.app_name}${payload.window_title ? ` - ${payload.window_title}` : ""}`,
          privacy_level: "local_only",
          timestamp: new Date(payload.timestamp_ms).toISOString(),
          details: {
            app_name: payload.app_name,
            window_title: payload.window_title,
            stored_locally: true,
            sent_to_cloud: false,
            screenshots: false,
            keystrokes: false
          }
        })
      ].slice(-1000));
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => {
        setCaptureError("Active-window capture is available in the Tauri desktop app.");
      });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (activeWindowSessions.length === 0) {
      return;
    }

    const latestSession = activeWindowSessions[0];
    setAuditEvents((current) => {
      const alreadyLogged = current.some(
        (event) => event.type === "activity_session" && event.details.session_id === latestSession.session_id
      );
      if (alreadyLogged || latestSession.sample_count < 2) {
        return current;
      }

      return [
        ...current,
        createAuditEvent({
          type: "activity_session",
          source: "sessionizer",
          title: "Active-window session grouped",
          summary: `${latestSession.app_name} grouped for ${latestSession.duration_minutes} min`,
          privacy_level: "derived_only",
          timestamp: latestSession.end_time,
          details: {
            ...latestSession,
            grouping_rule: "Adjacent samples with matching app and window title within 90 seconds",
            stored_locally: true,
            sent_to_cloud: false
          }
        })
      ].slice(-1000);
    });
  }, [activeWindowSessions]);

  useEffect(() => {
    if (!hasNarrativeEvidence || lastNarrativeAutoRunDate === todayKey || narrativeGenerationStatus !== "idle") {
      return;
    }

    setLastNarrativeAutoRunDate(todayKey);
    void regenerateNarrative("auto");
  }, [hasNarrativeEvidence, lastNarrativeAutoRunDate, narrativeGenerationStatus, todayKey]);

  useEffect(() => {
    const latestSession = activeWindowSessions[0];
    if (
      !visualContextEnabled ||
      paused ||
      !latestSession ||
      latestSession.duration_minutes < MIN_VISUAL_CONTEXT_SESSION_MINUTES ||
      latestSession.sample_count < 3 ||
      visualContextStatus === "capturing"
    ) {
      return;
    }

    const capturedToday = visualContextInsights.filter(
      (insight) => getLocalDateKey(new Date(insight.captured_at)) === todayKey
    );
    if (capturedToday.length >= MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY) {
      return;
    }

    const alreadyCaptured = visualContextInsights.some((insight) => insight.session_id === latestSession.session_id);
    const alreadyAttempted = visualContextAttemptedSessionIds.includes(latestSession.session_id);
    if (alreadyCaptured || alreadyAttempted) {
      return;
    }

    const lastCapture = [...visualContextInsights].sort(
      (left, right) => new Date(right.captured_at).getTime() - new Date(left.captured_at).getTime()
    )[0];
    if (lastCapture && Date.now() - new Date(lastCapture.captured_at).getTime() < MIN_VISUAL_CONTEXT_GAP_MS) {
      return;
    }

    setVisualContextAttemptedSessionIds((current) => [...current, latestSession.session_id]);
    void captureVisualContext(latestSession, capturedToday.length);
  }, [
    activeWindowSessions,
    paused,
    todayKey,
    visualContextAttemptedSessionIds,
    visualContextEnabled,
    visualContextInsights,
    visualContextStatus
  ]);

  function addCorrection(correction: Omit<UserCorrection, "correction_id" | "timestamp">) {
    const timestamp = new Date().toISOString();
    const fullCorrection = {
      ...correction,
      correction_id: crypto.randomUUID(),
      timestamp
    };

    setCorrections((current) => [...current, fullCorrection]);
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "user_correction",
        source: "review_layer",
        title: fieldLabel(fullCorrection.field),
        summary: `${fullCorrection.old_value} -> ${fullCorrection.new_value}`,
        privacy_level: "local_only",
        timestamp,
        details: {
          ...fullCorrection,
          stored_locally: true,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }

  async function regenerateNarrative(trigger: "auto" | "manual") {
    if (!hasNarrativeEvidence || narrativeGenerationStatus === "generating") {
      return;
    }

    const generatedAt = new Date().toISOString();
    const prompt = buildWeeklyNarrativePrompt({
      weekId: currentWeekId,
      weekRangeLabel: currentWeekRangeLabel,
      snapshot,
      blocks,
      activeWindowSessions,
      calendarEvents,
      visualContextInsights,
      corrections
    });

    setNarrativeGenerationStatus("generating");
    setNarrativeGenerationError(null);

    try {
      const response = await invoke<NativeNarrativeGenerationResponse>("generate_weekly_narrative_with_openai", {
        request: {
          prompt
        }
      });
      const sanitizedNarrative = displaySafeNarrative(response.narrative, currentWeekRangeLabel);
      const record: PersistedNarrativeRecord = {
        narrative: sanitizedNarrative,
        generated_at: generatedAt,
        generated_for_date: getLocalDateKey(new Date(generatedAt)),
        trigger,
        model: response.model,
        prompt_version: NARRATIVE_PROMPT_VERSION
      };

      setGeneratedNarrative(record);
      setManagerSummaryText(null);
      setNarrativeGenerationStatus("idle");
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
            store: false
          }
        })
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNarrativeGenerationStatus("error");
      setNarrativeGenerationError(message);
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
            sent_to_openai: true
          }
        })
      ].slice(-1000));
    }
  }

  async function captureVisualContext(session: ActivitySession, captureCountToday: number) {
    const startedAt = new Date().toISOString();
    const prompt = buildVisualContextPrompt({
      session,
      captureCountToday,
      maxDailyCaptures: MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY
    });

    setVisualContextStatus("capturing");
    setVisualContextError(null);

    try {
      const response = await invoke<NativeVisualContextResponse>("capture_visual_context_with_openai", {
        request: {
          prompt,
          appName: session.app_name,
          windowTitle: session.window_title,
          sessionId: session.session_id
        }
      });
      const insight: VisualContextInsight = {
        insight_id: `visual-${stableHash(`${response.captured_at_ms}-${session.session_id}`)}`,
        captured_at: new Date(response.captured_at_ms).toISOString(),
        session_id: response.session_id,
        app_name: response.app_name,
        window_title: response.window_title,
        activity_summary: response.insight.activity_summary,
        visible_tool: response.insight.visible_tool,
        likely_work_category: response.insight.likely_work_category,
        likely_mode: response.insight.likely_mode,
        project_hint: response.insight.project_hint,
        sensitive_content_detected: response.insight.sensitive_content_detected,
        confidence: response.insight.confidence,
        evidence: response.insight.evidence,
        privacy_level: "derived_only",
        model: response.model,
        raw_screenshot_retained: response.raw_screenshot_retained
      };

      setVisualContextInsights((current) => [...current, insight].slice(-200));
      setVisualContextStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "visual_context",
          source: "openai_vision",
          title: "Visual context captured",
          summary: insight.activity_summary,
          privacy_level: "derived_only",
          timestamp: insight.captured_at,
          details: {
            insight,
            prompt_version: VISUAL_CONTEXT_PROMPT_VERSION,
            capture_mode: "smart_occasional",
            capture_count_today: captureCountToday + 1,
            max_daily_captures: MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY,
            sent_to_openai: true,
            raw_screenshot_retained: response.raw_screenshot_retained,
            store: false
          }
        })
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVisualContextStatus("error");
      setVisualContextError(message);
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "visual_context",
          source: "openai_vision",
          title: "Visual context capture failed",
          summary: message,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            session_id: session.session_id,
            app_name: session.app_name,
            window_title: session.window_title,
            prompt_version: VISUAL_CONTEXT_PROMPT_VERSION,
            capture_mode: "smart_occasional",
            sent_to_openai: false,
            raw_screenshot_retained: false
          }
        })
      ].slice(-1000));
    }
  }

  function classifiedBlockToWorkBlock(
    block: NativeClassifiedWorkBlock,
    sourceSessions: Map<string, ActivitySession>
  ): WorkBlock | null {
    const sessions = block.session_ids
      .map((sessionId) => sourceSessions.get(sessionId))
      .filter((session): session is ActivitySession => Boolean(session));

    if (sessions.length === 0) {
      return null;
    }

    const parsedStart = new Date(block.start_time).getTime();
    const parsedEnd = new Date(block.end_time).getTime();
    const startCandidates = sessions.map((session) => new Date(session.start_time).getTime());
    const endCandidates = sessions.map((session) => new Date(session.end_time).getTime());
    if (!Number.isNaN(parsedStart)) {
      startCandidates.push(parsedStart);
    }
    if (!Number.isNaN(parsedEnd)) {
      endCandidates.push(parsedEnd);
    }
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
      evidence: [
        "Drafted by OpenAI from local active-window sessions",
        ...block.evidence
      ],
      confidence: Math.max(0.45, Math.min(0.9, block.confidence)),
      user_verified: false,
      blocker_flag: block.blocker_flag,
      notes: block.notes
    };
  }

  async function classifyActiveWindowSessions() {
    if (classificationStatus === "classifying") {
      return;
    }

    const alreadyClassified = new Set(blocks.flatMap((block) => block.derived_from));
    const candidateSessions = activeWindowSessions
      .filter((session) => !alreadyClassified.has(session.session_id) && session.sample_count >= 2)
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());

    if (candidateSessions.length === 0) {
      setClassificationError("No unclassified active-window sessions are ready yet.");
      setClassificationStatus("error");
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
      corrections
    });

    setClassificationStatus("classifying");
    setClassificationError(null);

    try {
      const response = await invoke<NativeWorkBlockClassificationResponse>("classify_active_window_sessions_with_openai", {
        request: {
          prompt
        }
      });
      const sessionMap = new Map(candidateSessions.map((session) => [session.session_id, session]));
      const draftBlocks = response.result.work_blocks
        .map((block) => classifiedBlockToWorkBlock(block, sessionMap))
        .filter((block): block is WorkBlock => Boolean(block));

      setBlocks((current) => {
        const existingIds = new Set(current.map((block) => block.work_block_id));
        return [
          ...current,
          ...draftBlocks.filter((block) => !existingIds.has(block.work_block_id))
        ].sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
      });
      setClassificationStatus("idle");
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
            model: response.model,
            prompt_version: WORK_BLOCK_CLASSIFIER_PROMPT_VERSION,
            input_session_count: candidateSessions.length,
            output_work_block_count: draftBlocks.length,
            work_block_ids: draftBlocks.map((block) => block.work_block_id),
            sent_to_openai: true,
            store: false
          }
        })
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setClassificationStatus("error");
      setClassificationError(message);
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
            sent_to_openai: true
          }
        })
      ].slice(-1000));
    }
  }

  async function generateReviewCopilotSuggestions() {
    if (reviewCopilotStatus === "generating") {
      return;
    }

    const reviewQueue = blocks.filter((block) => !block.user_verified);
    if (reviewQueue.length === 0) {
      setReviewCopilotStatus("error");
      setReviewCopilotError("There are no unverified blocks for the Review Copilot to inspect.");
      return;
    }

    const startedAt = new Date().toISOString();
    const prompt = buildReviewCopilotPrompt({
      weekId: currentWeekId,
      weekRangeLabel: currentWeekRangeLabel,
      snapshot,
      reviewQueue,
      allBlocks: blocks,
      activeWindowSessions,
      calendarEvents,
      corrections
    });

    setReviewCopilotStatus("generating");
    setReviewCopilotError(null);

    try {
      const response = await invoke<NativeReviewCopilotResponse>("generate_review_copilot_suggestions_with_openai", {
        request: {
          prompt
        }
      });
      const blockIds = new Set(blocks.map((block) => block.work_block_id));
      const suggestions = response.result.suggestions
        .map<ReviewCopilotSuggestion>((suggestion) => ({
          ...suggestion,
          work_block_ids: suggestion.work_block_ids.filter((blockId) => blockIds.has(blockId)),
          suggestion_id: `review-${stableHash(`${startedAt}-${suggestion.action}-${suggestion.work_block_ids.join("|")}-${suggestion.title}`)}`
        }))
        .filter((suggestion) => suggestion.work_block_ids.length > 0);

      setReviewSuggestions(suggestions);
      setReviewCopilotStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "review_copilot",
          source: "openai_responses_api",
          title: "Review Copilot suggestions generated",
          summary: `${suggestions.length} suggestions generated for ${reviewQueue.length} unverified blocks`,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            week_id: currentWeekId,
            week_range: currentWeekRangeLabel,
            model: response.model,
            prompt_version: REVIEW_COPILOT_PROMPT_VERSION,
            review_queue_count: reviewQueue.length,
            suggestion_count: suggestions.length,
            sent_to_openai: true,
            store: false
          }
        })
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReviewCopilotStatus("error");
      setReviewCopilotError(message);
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
            review_queue_count: reviewQueue.length,
            sent_to_openai: true
          }
        })
      ].slice(-1000));
    }
  }

  async function generateForecastAgent() {
    if (forecastStatus === "generating") {
      return;
    }

    if (blocks.length === 0) {
      setForecastStatus("error");
      setForecastError("The Forecast Agent needs at least one work block before it can estimate next-week capacity.");
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
      corrections
    });

    setForecastStatus("generating");
    setForecastError(null);

    try {
      const response = await invoke<NativeForecastAgentResponse>("generate_forecast_agent_with_openai", {
        request: {
          prompt
        }
      });
      const record: PersistedForecastRecord = {
        forecast: response.forecast,
        generated_at: startedAt,
        generated_for_week: nextWeekId,
        trigger: "manual",
        model: response.model,
        prompt_version: FORECAST_AGENT_PROMPT_VERSION
      };

      setGeneratedForecast(record);
      setForecastStatus("idle");
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
            store: false
          }
        })
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setForecastStatus("error");
      setForecastError(message);
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
            sent_to_openai: true
          }
        })
      ].slice(-1000));
    }
  }

  function dismissReviewSuggestion(suggestionId: string) {
    setReviewSuggestions((current) => current.filter((suggestion) => suggestion.suggestion_id !== suggestionId));
  }

  function applyReviewSuggestion(suggestion: ReviewCopilotSuggestion) {
    const targetBlocks = blocks.filter((block) => suggestion.work_block_ids.includes(block.work_block_id));
    if (targetBlocks.length === 0) {
      dismissReviewSuggestion(suggestion.suggestion_id);
      return;
    }

    if (suggestion.action === "confirm") {
      targetBlocks.forEach((block) => confirmBlock(block.work_block_id));
      dismissReviewSuggestion(suggestion.suggestion_id);
      return;
    }

    if (suggestion.action === "exclude") {
      targetBlocks.forEach((block) => excludeBlock(block.work_block_id));
      dismissReviewSuggestion(suggestion.suggestion_id);
      return;
    }

    const updates: Partial<WorkBlock> = {};
    if (suggestion.proposed_category) {
      updates.category = suggestion.proposed_category;
    }
    if (suggestion.proposed_mode) {
      updates.mode = suggestion.proposed_mode;
    }
    if (suggestion.proposed_planned_status) {
      updates.planned_status = suggestion.proposed_planned_status;
    }
    if (suggestion.proposed_project_name) {
      updates.project_name = suggestion.proposed_project_name;
    }
    if (suggestion.proposed_stakeholder_group) {
      updates.stakeholder_group = suggestion.proposed_stakeholder_group;
    }
    if (suggestion.proposed_blocker_flag !== null) {
      updates.blocker_flag = suggestion.proposed_blocker_flag;
    }
    if (suggestion.proposed_notes || suggestion.action === "merge" || suggestion.action === "split" || suggestion.action === "note") {
      updates.notes = suggestion.proposed_notes ?? `Review Copilot suggestion: ${suggestion.rationale}`;
    }

    const correctionFields: Array<keyof WorkBlock> = [
      "category",
      "mode",
      "planned_status",
      "project_name",
      "stakeholder_group",
      "blocker_flag",
      "notes"
    ];
    targetBlocks.forEach((block) => {
      correctionFields.forEach((field) => {
        if (!(field in updates)) {
          return;
        }
        const nextValue = updates[field];
        if (String(block[field]) === String(nextValue)) {
          return;
        }
        addCorrection({
          work_block_id: block.work_block_id,
          field: field as UserCorrection["field"],
          old_value: String(block[field] ?? ""),
          new_value: String(nextValue ?? ""),
          reason: `Review Copilot ${suggestion.action}: ${suggestion.rationale}`
        });
      });
    });

    setBlocks((current) =>
      current.map((block) =>
        suggestion.work_block_ids.includes(block.work_block_id)
          ? { ...block, ...updates, user_verified: false }
          : block
      )
    );
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "review_copilot",
        source: "review_layer",
        title: "Review Copilot suggestion applied",
        summary: suggestion.title,
        privacy_level: "local_only",
        details: {
          suggestion,
          applied_work_block_ids: suggestion.work_block_ids
        }
      })
    ].slice(-1000));
    dismissReviewSuggestion(suggestion.suggestion_id);
  }

  function updateBlock<K extends keyof WorkBlock>(blockId: string, field: K, value: WorkBlock[K]) {
    const oldBlock = blocks.find((block) => block.work_block_id === blockId);
    if (!oldBlock || String(oldBlock[field]) === String(value)) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.work_block_id === blockId ? { ...block, [field]: value, user_verified: false } : block
      )
    );
    addCorrection({
      work_block_id: blockId,
      field: field as UserCorrection["field"],
      old_value: String(oldBlock[field]),
      new_value: String(value),
      reason: "Manual review adjustment"
    });
  }

  function confirmBlock(blockId: string) {
    const oldBlock = blocks.find((block) => block.work_block_id === blockId);
    if (!oldBlock || oldBlock.user_verified) {
      return;
    }

    setBlocks((current) =>
      current.map((block) => (block.work_block_id === blockId ? { ...block, user_verified: true, confidence: Math.max(block.confidence, 0.9) } : block))
    );
    addCorrection({
      work_block_id: blockId,
      field: "verification",
      old_value: "unverified",
      new_value: "verified",
      reason: "User confirmed inferred block"
    });
  }

  function excludeBlock(blockId: string) {
    const oldBlock = blocks.find((block) => block.work_block_id === blockId);
    if (!oldBlock) {
      return;
    }

    setBlocks((current) => current.filter((block) => block.work_block_id !== blockId));
    addCorrection({
      work_block_id: blockId,
      field: "exclude",
      old_value: oldBlock.project_name,
      new_value: "excluded",
      reason: "User excluded sensitive or irrelevant block"
    });
  }

  function updateManagerSummary(value: string) {
    setManagerSummaryText(value);
    const lastSummaryCorrection = [...corrections]
      .reverse()
      .find((correction) => correction.field === "manager_summary");

    if (!lastSummaryCorrection || lastSummaryCorrection.new_value !== "edited locally") {
      addCorrection({
        work_block_id: currentWeekId,
        field: "manager_summary",
        old_value: "generated",
        new_value: "edited locally",
        reason: "User edited manager-ready narrative"
      });
    }
  }

  function resetLocalData() {
    clearPersistedState();
    setBlocks([]);
    setCalendarEvents([]);
    setActiveWindowSamples([]);
    setAuditEvents([]);
    setCorrections([]);
    setReviewSuggestions([]);
    setGeneratedForecast(null);
    setVisualContextEnabled(true);
    setVisualContextInsights([]);
    setVisualContextAttemptedSessionIds([]);
    setManagerSummaryText(null);
    setGeneratedNarrative(null);
    setLastNarrativeAutoRunDate(null);
    setNarrativeGenerationStatus("idle");
    setNarrativeGenerationError(null);
    setClassificationStatus("idle");
    setClassificationError(null);
    setReviewCopilotStatus("idle");
    setReviewCopilotError(null);
    setForecastStatus("idle");
    setForecastError(null);
    setVisualContextStatus("idle");
    setVisualContextError(null);
    setImportError(null);
    setCaptureError(null);
    setPaused(false);
  }

  function importOutlookIcs(file: File) {
    setImportError(null);
    const reader = new FileReader();

    reader.onerror = () => {
      setImportError("Could not read that Outlook export.");
    };

    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        const importedEvents = parseOutlookIcs(content);

        if (importedEvents.length === 0) {
          setImportError("No usable calendar events were found in that .ics file.");
          return;
        }

        setCalendarEvents((current) => {
          const merged = new Map(current.map((event) => [event.calendar_event_id, event]));
          importedEvents.forEach((event) => merged.set(event.calendar_event_id, event));
          return [...merged.values()].sort(
            (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
          );
        });

        setBlocks((current) => {
          const nonCalendarBlocks = current.filter((block) => !block.work_block_id.startsWith("calendar-outlook-"));
          const currentEvents = new Map(calendarEvents.map((event) => [event.calendar_event_id, event]));
          importedEvents.forEach((event) => currentEvents.set(event.calendar_event_id, event));
          return [
            ...nonCalendarBlocks,
            ...outlookEventsToWorkBlocks([...currentEvents.values()], currentWeekId)
          ].sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
        });

        addCorrection({
          work_block_id: currentWeekId,
          field: "calendar_import",
          old_value: "Outlook events",
          new_value: `${importedEvents.length} imported`,
          reason: `Imported ${file.name}`
        });
        setAuditEvents((current) => [
          ...current,
          createAuditEvent({
            type: "calendar_import",
            source: "outlook_ics",
            title: "Outlook calendar imported",
            summary: `${importedEvents.length} events parsed from ${file.name}`,
            privacy_level: "local_only",
            details: {
              file_name: file.name,
              imported_event_count: importedEvents.length,
              event_ids: importedEvents.map((event) => event.calendar_event_id),
              stored_locally: true,
              sent_to_cloud: false,
              email_bodies: false,
              meeting_notes: false
            }
          })
        ].slice(-1000));
      } catch {
        setImportError("The .ics file could not be parsed.");
      }
    };

    reader.readAsText(file);
  }

  return (
    <AppShell
      active={active}
      setActive={setActive}
      toolbarActions={toolbarActions}
      toolbarStatus={toolbarStatus}
      snapshot={snapshot}
      hasWorkBlocks={blocks.length > 0}
      paused={paused}
      setPaused={setPaused}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      windowMode={windowMode}
      setWindowMode={setWindowMode}
    >
      {windowMode === "compact" ? (
        <CompactWidget
          paused={paused}
          activeWindowSamples={activeWindowSamples}
          activeWindowSessions={activeWindowSessions}
          visualContextInsights={visualContextInsights}
          auditEvents={auditEvents}
          generatedNarrative={generatedNarrative}
          narrative={narrative}
          weekRangeLabel={currentWeekRangeLabel}
          snapshot={snapshot}
        />
      ) : (
        <>
      {active === "setup" && (
        <SetupScreen
          paused={paused}
          setPaused={setPaused}
          visualContextEnabled={visualContextEnabled}
          setVisualContextEnabled={setVisualContextEnabled}
          visualContextInsights={visualContextInsights}
          calendarEvents={calendarEvents}
          activeWindowSamples={activeWindowSamples}
          activeWindowSessions={activeWindowSessions}
          captureError={captureError}
          importError={importError}
          onImportOutlookIcs={importOutlookIcs}
        />
      )}
      {active === "ledger" && (
        <LedgerScreen
          blocks={blocks}
          activeWindowSamples={activeWindowSamples}
          activeWindowSessions={activeWindowSessions}
          visualContextInsights={visualContextInsights}
          captureError={captureError}
          classificationStatus={classificationStatus}
          classificationError={classificationError}
          visualContextStatus={visualContextStatus}
          visualContextError={visualContextError}
          paused={paused}
          onClassifySessions={() => void classifyActiveWindowSessions()}
          onConfirm={confirmBlock}
          onExclude={excludeBlock}
          onRelabel={updateBlock}
        />
      )}
      {active === "daily" && (
        <DailyReviewScreen
          blocks={blocks}
          corrections={corrections}
          reviewSuggestions={reviewSuggestions}
          reviewCopilotStatus={reviewCopilotStatus}
          reviewCopilotError={reviewCopilotError}
          onGenerateReviewSuggestions={() => void generateReviewCopilotSuggestions()}
          onApplyReviewSuggestion={applyReviewSuggestion}
          onDismissReviewSuggestion={dismissReviewSuggestion}
          onConfirm={confirmBlock}
          onExclude={excludeBlock}
          onRelabel={updateBlock}
          onResetLocalData={resetLocalData}
        />
      )}
      {active === "weekly" && (
        <WeeklyCapacityScreen
          snapshot={snapshot}
          weekRangeLabel={currentWeekRangeLabel}
          nextWeekRangeLabel={nextWeekRangeLabel}
          generatedForecast={generatedForecast}
          forecastStatus={forecastStatus}
          forecastError={forecastError}
          onGenerateForecast={() => void generateForecastAgent()}
          hasWorkBlocks={blocks.length > 0}
        />
      )}
      {active === "narrative" && (
        <NarrativeScreen
          narrative={narrative}
          generatedNarrative={generatedNarrative}
          weekRangeLabel={currentWeekRangeLabel}
          hasNarrativeEvidence={hasNarrativeEvidence}
          generationStatus={narrativeGenerationStatus}
          generationError={narrativeGenerationError}
          managerSummaryText={managerSummaryText}
          onManagerSummaryChange={updateManagerSummary}
          onRegenerate={() => void regenerateNarrative("manual")}
        />
      )}
      {active === "audit" && <AuditLogScreen auditEvents={auditEvents} />}
        </>
      )}
    </AppShell>
  );
}
