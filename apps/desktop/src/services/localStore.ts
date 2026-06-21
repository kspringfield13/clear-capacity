import { Store } from "@tauri-apps/plugin-store";
import type {
  ActiveWindowSample,
  AuditEvent,
  ForecastAgentResult,
  OutlookCalendarEvent,
  ReviewCopilotSuggestion,
  VisualContextInsight,
  WeeklyNarrative,
  UserCorrection,
  WorkBlock,
  AIConfig
} from "../../../../packages/domain/src/models";

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

export interface PersistedAppState {
  version: 1;
  blocks: WorkBlock[];
  calendarEvents: OutlookCalendarEvent[];
  activeWindowSamples: ActiveWindowSample[];
  auditEvents: AuditEvent[];
  corrections: UserCorrection[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  generatedForecast: PersistedForecastRecord | null;
  visualContextEnabled: boolean;
  visualContextInsights: VisualContextInsight[];
  managerSummaryText: string | null;
  generatedNarrative: PersistedNarrativeRecord | null;
  lastNarrativeAutoRunDate: string | null;
  paused: boolean;
  aiConfig: AIConfig | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
        activeWindowSamples: Array.isArray(parsed.activeWindowSamples) ? (parsed.activeWindowSamples as ActiveWindowSample[]) : [],
        auditEvents: Array.isArray(parsed.auditEvents) ? (parsed.auditEvents as AuditEvent[]) : [],
        corrections: Array.isArray(parsed.corrections) ? (parsed.corrections as UserCorrection[]) : [],
        reviewSuggestions: Array.isArray(parsed.reviewSuggestions) ? (parsed.reviewSuggestions as ReviewCopilotSuggestion[]) : [],
        generatedForecast: isRecord(parsed.generatedForecast) && isRecord(parsed.generatedForecast.forecast) ? (parsed.generatedForecast as unknown as PersistedForecastRecord) : null,
        visualContextEnabled: typeof parsed.visualContextEnabled === "boolean" ? parsed.visualContextEnabled : false,
        visualContextInsights: Array.isArray(parsed.visualContextInsights) ? (parsed.visualContextInsights as VisualContextInsight[]) : [],
        managerSummaryText: typeof parsed.managerSummaryText === "string" ? parsed.managerSummaryText : null,
        generatedNarrative: isRecord(parsed.generatedNarrative) && isRecord(parsed.generatedNarrative.narrative) ? (parsed.generatedNarrative as unknown as PersistedNarrativeRecord) : null,
        lastNarrativeAutoRunDate: typeof parsed.lastNarrativeAutoRunDate === "string" ? parsed.lastNarrativeAutoRunDate : null,
        paused: typeof parsed.paused === "boolean" ? parsed.paused : true,
        aiConfig: isRecord(parsed.aiConfig) ? (parsed.aiConfig as unknown as AIConfig) : null
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
      visualContextEnabled:
        typeof parsed.visualContextEnabled === "boolean" ? parsed.visualContextEnabled : false,
      visualContextInsights: Array.isArray(parsed.visualContextInsights)
        ? (parsed.visualContextInsights as VisualContextInsight[])
        : [],
      managerSummaryText:
        typeof parsed.managerSummaryText === "string" ? parsed.managerSummaryText : null,
      generatedNarrative:
        isRecord(parsed.generatedNarrative) && isRecord(parsed.generatedNarrative.narrative)
          ? (parsed.generatedNarrative as unknown as PersistedNarrativeRecord)
          : null,
      lastNarrativeAutoRunDate:
        typeof parsed.lastNarrativeAutoRunDate === "string" ? parsed.lastNarrativeAutoRunDate : null,
      paused: typeof parsed.paused === "boolean" ? parsed.paused : true,
      aiConfig: isRecord(parsed.aiConfig) ? (parsed.aiConfig as unknown as AIConfig) : null
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
