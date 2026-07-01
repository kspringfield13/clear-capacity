import { Store } from "@tauri-apps/plugin-store";
import type {
  ActiveWindowSample,
  AuditEvent,
  ForecastAgentResult,
  OutlookCalendarEvent,
  RawEvent,
  ReviewCopilotSuggestion,
  VisualContextInsight,
  WeeklyCapacitySnapshot,
  WeeklyNarrative,
  UserCorrection,
  WorkBlock,
  AIConfig
} from "../../../../packages/domain/src/models";
import {
  DEFAULT_PROACTIVE_ALERT_SETTINGS,
  EMPTY_PROACTIVE_ALERT_RUNTIME,
  type ProactiveAlertRuntime,
  type ProactiveAlertSettings,
} from "../lib/proactiveAlerts";
import type { AuthoredAccelerationPlay } from "./accelerationSchema";

const STORE_FILE = "clear-capacity.store";
const STATE_KEY = "appState";
const THEME_KEY = "theme";
const STORAGE_KEY = "clear-capacity:v1"; // fallback for non-Tauri
const THEME_STORAGE_KEY = "clear-capacity:theme";

export type AppTheme = "light" | "dark";

export interface PersistedNarrativeRecord {
  narrative: WeeklyNarrative;
  generated_at: string;
  generated_for_date: string;
  trigger: "auto" | "manual";
  model: string;
  prompt_version: string;
}

export interface PersistedForecastRecord {
  forecast: ForecastAgentResult;
  generated_at: string;
  generated_for_week: string;
  trigger: "manual";
  model: string;
  prompt_version: string;
}

/**
 * The AI-authored Acceleration Plays from the most recent opt-in synthesis run
 * (D2's `useAcceleration`). The deterministic miner re-derives its signals each
 * render, so only the authored payload is persisted here (keyed back to each
 * signal by `signal_id`); the hook merges it onto the live signals. Latest run
 * wins. Mirrors `PersistedForecastRecord`.
 */
export interface PersistedAccelerationRecord {
  plays: AuthoredAccelerationPlay[];
  generated_at: string;
  generated_for_week: string;
  model: string;
  prompt_version: string;
}

/**
 * A computed weekly snapshot retained under its ISO `week_id`. One record per week
 * (latest computation wins); the trail enables cross-week trends and personal
 * baselines. Mirrors `PersistedForecastRecord` so UI/inference can type against it
 * without importing storage internals.
 */
export interface PersistedSnapshotRecord {
  week_id: string;
  snapshot: WeeklyCapacitySnapshot;
  computed_at: string;
}

/**
 * A past forecast paired with how it scored once its target week arrived. Assembled
 * in `useDerived` from `forecastHistory` + the live snapshot; kept here next to
 * `PersistedForecastRecord` so UI components type against it without importing
 * inference internals.
 */
export interface ForecastAccuracyReview {
  record: PersistedForecastRecord;
  predicted_pct: number;
  actual_pct: number;
  error_pts: number;
  signed_error_pts: number;
  rating: "on_target" | "close" | "off";
}

export interface PersistedAppState {
  version: 1;
  blocks: WorkBlock[];
  calendarEvents: OutlookCalendarEvent[];
  /** Imported workplace-chat events (metadata only), kept for the interruption-load signal. */
  chatEvents: RawEvent[];
  activeWindowSamples: ActiveWindowSample[];
  auditEvents: AuditEvent[];
  corrections: UserCorrection[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  generatedForecast: PersistedForecastRecord | null;
  forecastHistory: PersistedForecastRecord[];
  snapshotHistory: PersistedSnapshotRecord[];
  visualContextEnabled: boolean;
  visualContextInsights: VisualContextInsight[];
  /** signal_ids of Acceleration Plays the user dismissed (hidden across reloads). */
  dismissedPlayIds: string[];
  /** signal_ids of Acceleration Plays the user saved for later. */
  savedPlayIds: string[];
  /** Latest AI-authored Acceleration Plays (opt-in synthesis); null until generated. */
  generatedPlays: PersistedAccelerationRecord | null;
  managerSummaryText: string | null;
  generatedNarrative: PersistedNarrativeRecord | null;
  lastNarrativeAutoRunDate: string | null;
  paused: boolean;
  aiConfig: AIConfig | null;
  /** Auto-expiry window (days) for raw activity samples; null = keep everything. */
  retentionDays: number | null;
  /** Whether the user dismissed the first-run getting-started card. */
  onboardingDismissed: boolean;
  /** Whether the user has finished (or skipped) the first-run app walkthrough. */
  walkthroughCompleted: boolean;
  /** Opt-in configuration for proactive menu-bar alerts. */
  proactiveAlertSettings: ProactiveAlertSettings;
  /** Throttle/dedup bookkeeping for proactive OS notifications. */
  proactiveAlertRuntime: ProactiveAlertRuntime;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRetentionDays(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function parseProactiveAlertSettings(value: unknown): ProactiveAlertSettings {
  if (!isRecord(value)) return { ...DEFAULT_PROACTIVE_ALERT_SETTINGS };
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_PROACTIVE_ALERT_SETTINGS.enabled,
    capacityGuardrailEnabled:
      typeof value.capacityGuardrailEnabled === "boolean"
        ? value.capacityGuardrailEnabled
        : DEFAULT_PROACTIVE_ALERT_SETTINGS.capacityGuardrailEnabled,
    capacityThresholdPct:
      typeof value.capacityThresholdPct === "number" && Number.isFinite(value.capacityThresholdPct)
        ? value.capacityThresholdPct
        : DEFAULT_PROACTIVE_ALERT_SETTINGS.capacityThresholdPct,
    endOfDayReviewEnabled:
      typeof value.endOfDayReviewEnabled === "boolean"
        ? value.endOfDayReviewEnabled
        : DEFAULT_PROACTIVE_ALERT_SETTINGS.endOfDayReviewEnabled,
    heavyDayAheadEnabled:
      typeof value.heavyDayAheadEnabled === "boolean"
        ? value.heavyDayAheadEnabled
        : DEFAULT_PROACTIVE_ALERT_SETTINGS.heavyDayAheadEnabled,
    weeklyArtifactsEnabled:
      typeof value.weeklyArtifactsEnabled === "boolean"
        ? value.weeklyArtifactsEnabled
        : DEFAULT_PROACTIVE_ALERT_SETTINGS.weeklyArtifactsEnabled,
    fragmentationEnabled:
      typeof value.fragmentationEnabled === "boolean"
        ? value.fragmentationEnabled
        : DEFAULT_PROACTIVE_ALERT_SETTINGS.fragmentationEnabled,
  };
}

function parseProactiveAlertRuntime(value: unknown): ProactiveAlertRuntime {
  if (!isRecord(value)) return { ...EMPTY_PROACTIVE_ALERT_RUNTIME };
  return {
    lastFiredSignatureByRule: isRecord(value.lastFiredSignatureByRule)
      ? (value.lastFiredSignatureByRule as Record<string, string>)
      : {},
    lastFiredAt: typeof value.lastFiredAt === "string" ? value.lastFiredAt : null,
    firedCountByDate: isRecord(value.firedCountByDate)
      ? (value.firedCountByDate as Record<string, number>)
      : {},
  };
}

function parseForecastHistory(value: unknown): PersistedForecastRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is PersistedForecastRecord =>
      isRecord(entry) && isRecord(entry.forecast) && typeof entry.generated_for_week === "string"
  );
}

function parseSnapshotHistory(value: unknown): PersistedSnapshotRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is PersistedSnapshotRecord =>
      isRecord(entry) && isRecord(entry.snapshot) && typeof entry.week_id === "string"
  );
}

function parseStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Validate the persisted AI-authored Acceleration record. Requires a real `plays`
 * array and the record metadata; a malformed blob degrades to `null` (the screen
 * then just renders the deterministic signals). The `plays` entries are trusted as
 * the shape the schema/hook already validated at write time.
 */
function parseAccelerationRecord(value: unknown): PersistedAccelerationRecord | null {
  if (!isRecord(value) || !Array.isArray(value.plays) || typeof value.generated_for_week !== "string") {
    return null;
  }
  return value as unknown as PersistedAccelerationRecord;
}

function parseChatEvents(value: unknown): RawEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is RawEvent =>
      isRecord(entry) &&
      entry.source_type === "chat" &&
      typeof entry.timestamp_start === "string" &&
      typeof entry.timestamp_end === "string" &&
      // metadata must be a real object — `analyzeInterruptionLoad` reads counts off it
      // without guarding, so a corrupted null/missing bag would crash the render.
      isRecord(entry.metadata)
  );
}

async function getStore(): Promise<Store | null> {
  try {
    if (!("__TAURI_INTERNALS__" in window)) {
      // Non-Tauri environment (web dev/preview) - return null to fallback
      return null;
    }
    return await Store.load(STORE_FILE);
  } catch {
    return null;
  }
}

export async function readPersistedState(): Promise<PersistedAppState | null> {
  try {
    const store = await getStore();
    if (!store) {
      // Fallback to localStorage for web/dev
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.blocks)) return null;
      // (simplified return, same mapping as before)
      return {
        version: 1,
        blocks: parsed.blocks as WorkBlock[],
        calendarEvents: Array.isArray(parsed.calendarEvents) ? (parsed.calendarEvents as OutlookCalendarEvent[]) : [],
        chatEvents: parseChatEvents(parsed.chatEvents),
        activeWindowSamples: Array.isArray(parsed.activeWindowSamples) ? (parsed.activeWindowSamples as ActiveWindowSample[]) : [],
        auditEvents: Array.isArray(parsed.auditEvents) ? (parsed.auditEvents as AuditEvent[]) : [],
        corrections: Array.isArray(parsed.corrections) ? (parsed.corrections as UserCorrection[]) : [],
        reviewSuggestions: Array.isArray(parsed.reviewSuggestions) ? (parsed.reviewSuggestions as ReviewCopilotSuggestion[]) : [],
        generatedForecast: isRecord(parsed.generatedForecast) && isRecord(parsed.generatedForecast.forecast) ? (parsed.generatedForecast as unknown as PersistedForecastRecord) : null,
        forecastHistory: parseForecastHistory(parsed.forecastHistory),
        snapshotHistory: parseSnapshotHistory(parsed.snapshotHistory),
        visualContextEnabled: typeof parsed.visualContextEnabled === "boolean" ? parsed.visualContextEnabled : false,
        visualContextInsights: Array.isArray(parsed.visualContextInsights) ? (parsed.visualContextInsights as VisualContextInsight[]) : [],
        dismissedPlayIds: parseStringIdList(parsed.dismissedPlayIds),
        savedPlayIds: parseStringIdList(parsed.savedPlayIds),
        generatedPlays: parseAccelerationRecord(parsed.generatedPlays),
        managerSummaryText: typeof parsed.managerSummaryText === "string" ? parsed.managerSummaryText : null,
        generatedNarrative: isRecord(parsed.generatedNarrative) && isRecord(parsed.generatedNarrative.narrative) ? (parsed.generatedNarrative as unknown as PersistedNarrativeRecord) : null,
        lastNarrativeAutoRunDate: typeof parsed.lastNarrativeAutoRunDate === "string" ? parsed.lastNarrativeAutoRunDate : null,
        paused: typeof parsed.paused === "boolean" ? parsed.paused : true,
        aiConfig: isRecord(parsed.aiConfig) ? (parsed.aiConfig as unknown as AIConfig) : null,
        retentionDays: parseRetentionDays(parsed.retentionDays),
        onboardingDismissed: typeof parsed.onboardingDismissed === "boolean" ? parsed.onboardingDismissed : false,
        walkthroughCompleted: typeof parsed.walkthroughCompleted === "boolean" ? parsed.walkthroughCompleted : false,
        proactiveAlertSettings: parseProactiveAlertSettings(parsed.proactiveAlertSettings),
        proactiveAlertRuntime: parseProactiveAlertRuntime(parsed.proactiveAlertRuntime)
      };
    }
    const data = await store.get<unknown>(STATE_KEY);
    if (!data) {
      return null;
    }

    const parsed: unknown = data;
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.blocks)) {
      return null;
    }

    return {
      version: 1,
      blocks: parsed.blocks as WorkBlock[],
      calendarEvents: Array.isArray(parsed.calendarEvents) ? (parsed.calendarEvents as OutlookCalendarEvent[]) : [],
      chatEvents: parseChatEvents(parsed.chatEvents),
      activeWindowSamples: Array.isArray(parsed.activeWindowSamples)
        ? (parsed.activeWindowSamples as ActiveWindowSample[])
        : [],
      auditEvents: Array.isArray(parsed.auditEvents) ? (parsed.auditEvents as AuditEvent[]) : [],
      corrections: Array.isArray(parsed.corrections) ? (parsed.corrections as UserCorrection[]) : [],
      reviewSuggestions: Array.isArray(parsed.reviewSuggestions)
        ? (parsed.reviewSuggestions as ReviewCopilotSuggestion[])
        : [],
      generatedForecast:
        isRecord(parsed.generatedForecast) && isRecord(parsed.generatedForecast.forecast)
          ? (parsed.generatedForecast as unknown as PersistedForecastRecord)
          : null,
      forecastHistory: parseForecastHistory(parsed.forecastHistory),
      snapshotHistory: parseSnapshotHistory(parsed.snapshotHistory),
      visualContextEnabled:
        typeof parsed.visualContextEnabled === "boolean" ? parsed.visualContextEnabled : false,
      visualContextInsights: Array.isArray(parsed.visualContextInsights)
        ? (parsed.visualContextInsights as VisualContextInsight[])
        : [],
      dismissedPlayIds: parseStringIdList(parsed.dismissedPlayIds),
      savedPlayIds: parseStringIdList(parsed.savedPlayIds),
      generatedPlays: parseAccelerationRecord(parsed.generatedPlays),
      managerSummaryText:
        typeof parsed.managerSummaryText === "string" ? parsed.managerSummaryText : null,
      generatedNarrative:
        isRecord(parsed.generatedNarrative) && isRecord(parsed.generatedNarrative.narrative)
          ? (parsed.generatedNarrative as unknown as PersistedNarrativeRecord)
          : null,
      lastNarrativeAutoRunDate:
        typeof parsed.lastNarrativeAutoRunDate === "string" ? parsed.lastNarrativeAutoRunDate : null,
      paused: typeof parsed.paused === "boolean" ? parsed.paused : true,
      aiConfig: isRecord(parsed.aiConfig) ? (parsed.aiConfig as unknown as AIConfig) : null,
      retentionDays: parseRetentionDays(parsed.retentionDays),
      onboardingDismissed: typeof parsed.onboardingDismissed === "boolean" ? parsed.onboardingDismissed : false,
      walkthroughCompleted: typeof parsed.walkthroughCompleted === "boolean" ? parsed.walkthroughCompleted : false,
      proactiveAlertSettings: parseProactiveAlertSettings(parsed.proactiveAlertSettings),
      proactiveAlertRuntime: parseProactiveAlertRuntime(parsed.proactiveAlertRuntime)
    };
  } catch {
    return null;
  }
}

export async function writePersistedState(state: PersistedAppState): Promise<void> {
  try {
    const store = await getStore();
    if (!store) {
      // fallback
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return;
    }
    await store.set(STATE_KEY, state);
    await store.save();
  } catch {
    // Silent fail for now
  }
}

export async function clearPersistedState(): Promise<void> {
  try {
    const store = await getStore();
    if (!store) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    await store.delete(STATE_KEY);
    await store.save();
  } catch {
    // ignore
  }
}

export async function readThemePreference(): Promise<AppTheme> {
  try {
    const store = await getStore();
    if (!store) {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      return raw === "dark" ? "dark" : "light";
    }
    const theme = await store.get<string>(THEME_KEY);
    return theme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export async function writeThemePreference(theme: AppTheme): Promise<void> {
  try {
    const store = await getStore();
    if (!store) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      return;
    }
    await store.set(THEME_KEY, theme);
    await store.save();
  } catch {
    // The in-memory theme still works when storage is unavailable.
  }
}
