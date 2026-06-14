import type {
  ActiveWindowSample,
  AuditEvent,
  ForecastAgentResult,
  OutlookCalendarEvent,
  ReviewCopilotSuggestion,
  VisualContextInsight,
  WeeklyNarrative,
  UserCorrection,
  WorkBlock
} from "../../../../packages/domain/src/models";

const STORAGE_KEY = "clear-capacity:v1";

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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readPersistedState(): PersistedAppState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
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
      paused: typeof parsed.paused === "boolean" ? parsed.paused : true
    };
  } catch {
    return null;
  }
}

export function writePersistedState(state: PersistedAppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearPersistedState() {
  window.localStorage.removeItem(STORAGE_KEY);
}
