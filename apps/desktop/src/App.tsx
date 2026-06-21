import { useEffect, useMemo, useState } from "react";
import { useAsyncStatus } from "./hooks/useAsyncStatus";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity,
  AlignLeft,
  BarChart3,
  CalendarCheck,
  Check,
  ChevronRight,
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
  Sun,
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
  WorkMode,
  AIConfig
} from "../../../packages/domain/src/models";
import {
  clearPersistedState,
  readPersistedState,
  readThemePreference,
  writePersistedState,
  writeThemePreference
} from "./services/localStore";
import type { AppTheme, PersistedForecastRecord, PersistedNarrativeRecord } from "./services/localStore";
import { createDemoState } from "./services/demoData";
import { buildForecastAgentPrompt, FORECAST_AGENT_PROMPT_VERSION } from "./services/forecastAgentPrompt";
import { buildWeeklyNarrativePrompt, NARRATIVE_PROMPT_VERSION } from "./services/narrativePrompt";
import { buildReviewCopilotPrompt, REVIEW_COPILOT_PROMPT_VERSION } from "./services/reviewCopilotPrompt";
import { buildVisualContextPrompt, VISUAL_CONTEXT_PROMPT_VERSION } from "./services/visualContextPrompt";
import {
  buildWorkBlockClassifierPrompt,
  WORK_BLOCK_CLASSIFIER_PROMPT_VERSION
} from "./services/workBlockClassifierPrompt";

import {
  addDays,
  displaySafeNarrative,
  formatWeekdayMonthDay,
  getBusinessWeekRangeLabel,
  getCurrentIsoWeekId,
  getLocalDateKey,
  ordinalDay,
  replaceIsoWeekIds
} from "./lib/date";
import {
  auditTypeLabel,
  compactCategory,
  fieldLabel,
  formatAuditTime,
  formatRange,
  formatTime,
  pct
} from "./lib/format";
import { createAuditEvent } from "./lib/audit";
import {
  capacityPctFromMinutes,
  removeSeededCorrections,
  removeSeededWorkBlocks,
  stableHash,
  summarizeRecentSessions
} from "./lib/blocks";
import { useDerived } from "./hooks/useDerived";
import { usePersistence } from "./hooks/usePersistence";
import { useBlocksLedger } from "./hooks/useBlocksLedger";
import { useActiveWindow } from "./hooks/useActiveWindow";

import { ConfidenceChip } from "./components/common/ConfidenceChip";
import { EmptyState } from "./components/common/EmptyState";
import { MetricCard } from "./components/common/MetricCard";
import { StackedBar } from "./components/common/StackedBar";
import { BarLine } from "./components/common/BarLine";
import { RiskRow } from "./components/common/RiskRow";
import { ForecastList } from "./components/common/ForecastList";
import { BlockCard } from "./components/ledger/BlockCard";
import { screenLabels, primarySectionForScreen, sectionViews } from "./lib/ui";
import {
  MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY,
  MIN_VISUAL_CONTEXT_SESSION_MINUTES,
  MIN_VISUAL_CONTEXT_GAP_MS
} from "./lib/constants";

import { AppShell } from "./components/shell/AppShell";
import { ContextNavigation } from "./components/shell/ContextNavigation";
import { CompactWidget } from "./components/compact/CompactWidget";
import { SetupScreen } from "./components/settings/SetupScreen";
import { LedgerScreen } from "./components/ledger/LedgerScreen";
import { ActivityCapturePanel } from "./components/ledger/ActivityCapturePanel";
import { DailyReviewScreen } from "./components/review/DailyReviewScreen";
import { WeeklyCapacityScreen } from "./components/capacity/WeeklyCapacityScreen";
import { NarrativeScreen } from "./components/narrative/NarrativeScreen";
import { AuditLogScreen } from "./components/audit/AuditLogScreen";
import { AgentScreen } from "./components/agent/AgentScreen";

import type { Screen, WindowMode, PrimarySection, AppToolbarAction } from "./lib/types";

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























export function App() {
  const [isDemoMode] = useState(() => new URLSearchParams(window.location.search).get("demo") === "1");
  const [persistedSnapshot, setPersistedSnapshot] = useState<any>(() => isDemoMode ? createDemoState() : null);
  const currentWeekId = useMemo(() => getCurrentIsoWeekId(), []);
  const currentWeekRangeLabel = useMemo(() => getBusinessWeekRangeLabel(), []);
  const nextWeekId = useMemo(() => getCurrentIsoWeekId(addDays(new Date(), 7)), []);
  const nextWeekRangeLabel = useMemo(() => getBusinessWeekRangeLabel(addDays(new Date(), 7)), []);

  // Async load persisted state (hydrates non-ledger state and forces re-eval)
  useEffect(() => {
    if (isDemoMode) return;
    readPersistedState().then((data) => {
      if (data) {
        setPersistedSnapshot(data);
        // Hydrate chrome + other states
        setActive((current) => {
          const requested = new URLSearchParams(window.location.search).get("screen") as Screen | null;
          if (isDemoMode && requested && requested in screenLabels) return requested;
          const loadedBlocks = removeSeededWorkBlocks(data.blocks ?? []);
          return loadedBlocks.some((block) => !block.user_verified) ? "daily" : current;
        });
        setPaused(data.paused ?? true);
        setActiveWindowSamples(data.activeWindowSamples ?? []);
        setAuditEvents(data.auditEvents ?? []);
        setGeneratedForecast(data.generatedForecast ?? null);
        setVisualContextEnabled(data.visualContextEnabled ?? false);
        setVisualContextInsights(data.visualContextInsights ?? []);
        setAiConfig(data.aiConfig ?? null);
        setManagerSummaryText(data.managerSummaryText ?? null);
        setGeneratedNarrative(data.generatedNarrative ?? null);
        setLastNarrativeAutoRunDate(data.lastNarrativeAutoRunDate ?? null);
      }
    }).catch(() => {});
  }, [isDemoMode]);

  const initialBlocks = removeSeededWorkBlocks(persistedSnapshot?.blocks ?? []);
  const [active, setActive] = useState<Screen>(() => {
    const requested = new URLSearchParams(window.location.search).get("screen") as Screen | null;
    return isDemoMode && requested && requested in screenLabels
      ? requested
      : initialBlocks.some((block) => !block.user_verified) ? "daily" : "weekly";
  });
  const [paused, setPaused] = useState(() => persistedSnapshot?.paused ?? true);
  const [activeWindowSamples, setActiveWindowSamples] = useState<ActiveWindowSample[]>(
    () => persistedSnapshot?.activeWindowSamples ?? []
  );
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => persistedSnapshot?.auditEvents ?? []);
  const [generatedForecast, setGeneratedForecast] = useState<PersistedForecastRecord | null>(
    () => persistedSnapshot?.generatedForecast ?? null
  );
  const [visualContextEnabled, setVisualContextEnabled] = useState<boolean>(
    () => persistedSnapshot?.visualContextEnabled ?? false
  );
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(
    () => persistedSnapshot?.aiConfig ?? null
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
  const [narrativeGenerationStatus, narrativeGenerationError, narrativeAsync] = useAsyncStatus<"idle" | "generating">("idle");
  const [classificationStatus, classificationError, classificationAsync] = useAsyncStatus<"idle" | "classifying">("idle");
  const [reviewCopilotStatus, reviewCopilotError, reviewCopilotAsync] = useAsyncStatus<"idle" | "generating">("idle");
  const [forecastStatus, forecastError, forecastAsync] = useAsyncStatus<"idle" | "generating">("idle");
  const [visualContextStatus, visualContextError, visualContextAsync] = useAsyncStatus<"idle" | "capturing">("idle");
  const [visualContextAttemptedSessionIds, setVisualContextAttemptedSessionIds] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("light");
  const [windowMode, setWindowMode] = useState<WindowMode>(() =>
    isDemoMode && new URLSearchParams(window.location.search).get("mode") === "compact" ? "compact" : "large"
  );

  const ledger = useBlocksLedger({
    initialBlocks,
    initialCalendarEvents: persistedSnapshot?.calendarEvents ?? [],
    initialCorrections: removeSeededCorrections(persistedSnapshot?.corrections ?? []),
    initialReviewSuggestions: persistedSnapshot?.reviewSuggestions ?? [],
    currentWeekId,
    isDemoMode,
    addAuditEvent: (event) => setAuditEvents((current) => [...current, createAuditEvent(event)].slice(-1000)),
  });

  const { blocks, setBlocks, calendarEvents, setCalendarEvents, corrections, setCorrections, reviewSuggestions, setReviewSuggestions, updateBlock, confirmBlock, excludeBlock } = ledger;

  // Late hydrate for ledger-owned state if async load completes after mount
  useEffect(() => {
    if (isDemoMode || !persistedSnapshot) return;
    const loadedBlocks = removeSeededWorkBlocks(persistedSnapshot.blocks ?? []);
    if (loadedBlocks.length > 0 || blocks.length === 0) {
      setBlocks(loadedBlocks);
    }
    setCalendarEvents(persistedSnapshot.calendarEvents ?? []);
    setCorrections(removeSeededCorrections(persistedSnapshot.corrections ?? []));
    setReviewSuggestions(persistedSnapshot.reviewSuggestions ?? []);
  }, [persistedSnapshot, isDemoMode]);

  usePersistence({
    blocks,
    calendarEvents,
    activeWindowSamples,
    auditEvents,
    corrections,
    reviewSuggestions,
    generatedForecast,
    visualContextEnabled,
    visualContextInsights,
    aiConfig,
    managerSummaryText,
    generatedNarrative,
    lastNarrativeAutoRunDate,
    paused,
    isDemoMode,
  });

  useActiveWindow({
    isDemoMode,
    setActiveWindowSamples,
    setAuditEvents,
  });

  const derived = useDerived({
    blocks,
    activeWindowSamples,
    calendarEvents,
    generatedNarrative,
    managerSummaryText,
    currentWeekId,
    currentWeekRangeLabel,
    nextWeekRangeLabel,
  });

  const {
    snapshot,
    narrative: narrativeFromHook,
    managerText,
    activeWindowSessions,
    hasNarrativeEvidence,
    todayKey,
    reviewQueue,
    toolbarStatus,
  } = derived;

  const narrative = narrativeFromHook; // keep name for compatibility with existing screens for now

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    function navigateFromNative(event: Event) {
      const screen = (event as CustomEvent<Screen>).detail;
      if (screen in screenLabels) {
        setActive(screen);
        setWindowMode("large");
      }
    }

    function togglePauseFromNative() {
      setPaused((current: boolean) => !current);
    }

    function openQuickViewFromNative() {
      setWindowMode("compact");
    }

    function openLargeViewFromNative() {
      setWindowMode("large");
    }

    window.addEventListener("clear-capacity:navigate", navigateFromNative);
    window.addEventListener("clear-capacity:toggle-pause", togglePauseFromNative);
    window.addEventListener("clear-capacity:quick-view", openQuickViewFromNative);
    window.addEventListener("clear-capacity:large-view", openLargeViewFromNative);

    return () => {
      window.removeEventListener("clear-capacity:navigate", navigateFromNative);
      window.removeEventListener("clear-capacity:toggle-pause", togglePauseFromNative);
      window.removeEventListener("clear-capacity:quick-view", openQuickViewFromNative);
      window.removeEventListener("clear-capacity:large-view", openLargeViewFromNative);
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
    if (isDemoMode) return;
    void invoke("set_pause_menu_label", { paused }).catch(() => undefined);
    void invoke("set_activity_capture_paused", { paused }).catch(() => undefined);
  }, [isDemoMode, paused]);

  useEffect(() => {
    if (windowMode === "compact") {
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(false);
    }
    void invoke("set_clear_capacity_window_mode", { mode: windowMode }).catch(() => undefined);
  }, [windowMode]);

  useEffect(() => {
    if (isDemoMode) return;
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
  }, [isDemoMode, paused]);


  useEffect(() => {
    if (isDemoMode) return;
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
  }, [activeWindowSessions, isDemoMode]);

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
    if (isDemoMode) return;
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

    narrativeAsync.start("generating");

    try {
      const response = await invoke<NativeNarrativeGenerationResponse>("generate_weekly_narrative_with_openai", {
        request: {
          prompt,
          ai_config: aiConfig
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
      narrativeAsync.setStatus("idle");
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
      narrativeAsync.fail(message);
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
    if (isDemoMode) return;
    const startedAt = new Date().toISOString();
    const prompt = buildVisualContextPrompt({
      session,
      captureCountToday,
      maxDailyCaptures: MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY
    });

    visualContextAsync.start("capturing");

    try {
      const response = await invoke<NativeVisualContextResponse>("capture_visual_context_with_openai", {
        request: {
          prompt,
          appName: session.app_name,
          windowTitle: session.window_title,
          sessionId: session.session_id,
          ai_config: aiConfig
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
      visualContextAsync.setStatus("idle");
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
      visualContextAsync.fail(message);
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
    if (isDemoMode) return;
    if (classificationStatus === "classifying") {
      return;
    }

    const alreadyClassified = new Set(blocks.flatMap((block) => block.derived_from));
    const candidateSessions = activeWindowSessions
      .filter((session) => !alreadyClassified.has(session.session_id) && session.sample_count >= 2)
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());

    if (candidateSessions.length === 0) {
      classificationAsync.fail("No unclassified active-window sessions are ready yet.");
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

    classificationAsync.start("classifying");

    try {
      const response = await invoke<NativeWorkBlockClassificationResponse>("classify_active_window_sessions_with_openai", {
        request: {
          prompt,
          ai_config: aiConfig
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
      classificationAsync.setStatus("idle");
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
      classificationAsync.fail(message);
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
    if (isDemoMode) return;
    if (reviewCopilotStatus === "generating") {
      return;
    }

    const reviewQueue = blocks.filter((block) => !block.user_verified);
    if (reviewQueue.length === 0) {
      reviewCopilotAsync.fail("There are no unverified blocks for the Review Copilot to inspect.");
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

    reviewCopilotAsync.start("generating");

    try {
      const response = await invoke<NativeReviewCopilotResponse>("generate_review_copilot_suggestions_with_openai", {
        request: {
          prompt,
          ai_config: aiConfig
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
      reviewCopilotAsync.setStatus("idle");
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
      reviewCopilotAsync.fail(message);
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
    if (isDemoMode) return;
    if (forecastStatus === "generating") {
      return;
    }

    if (blocks.length === 0) {
      forecastAsync.fail("The Forecast Agent needs at least one work block before it can estimate next-week capacity.");
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

    forecastAsync.start("generating");

    try {
      const response = await invoke<NativeForecastAgentResponse>("generate_forecast_agent_with_openai", {
        request: {
          prompt,
          ai_config: aiConfig
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
      forecastAsync.setStatus("idle");
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
      forecastAsync.fail(message);
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
    if (isDemoMode) {
      window.location.reload();
      return;
    }
    clearPersistedState().catch(() => {});
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
    narrativeAsync.reset();
    classificationAsync.reset();
    reviewCopilotAsync.reset();
    forecastAsync.reset();
    visualContextAsync.reset();
    setImportError(null);
    setCaptureError(null);
    setPaused(true);
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

  function openScreenFromQuickView(screen: Screen) {
    setActive(screen);
    setWindowMode("large");
  }

  const toolbarActions: AppToolbarAction[] = (() => {
    if (isDemoMode) return [];
    switch (active) {
      case "ledger":
        return [{ label: "Classify", icon: Tag, onClick: () => void classifyActiveWindowSessions(), disabled: classificationStatus === "classifying", tone: "primary" as const }];
      case "daily":
        return [{ label: "Review Copilot", icon: ShieldCheck, onClick: () => void generateReviewCopilotSuggestions(), disabled: reviewCopilotStatus === "generating" || reviewQueue.length === 0, tone: "primary" as const }];
      case "weekly":
        return [{ label: "Forecast", icon: BarChart3, onClick: () => void generateForecastAgent(), disabled: forecastStatus === "generating" || blocks.length === 0, tone: "primary" as const }];
      case "narrative":
        return [{ label: "Regenerate", icon: RefreshCw, onClick: () => void regenerateNarrative("manual"), disabled: narrativeGenerationStatus === "generating" || !hasNarrativeEvidence, tone: "primary" as const }];
      default:
        return [];
    }
  })();

  return (
    <AppShell
      active={active}
      setActive={setActive}
      toolbarActions={toolbarActions}
      toolbarStatus={toolbarStatus}
      snapshot={snapshot}
      hasWorkBlocks={blocks.length > 0}
      reviewCount={reviewQueue.length}
      paused={paused}
      setPaused={setPaused}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      windowMode={windowMode}
      setWindowMode={setWindowMode}
      theme={theme}
      setTheme={setTheme}
      demoMode={isDemoMode}
    >
      {windowMode === "compact" ? (
        <CompactWidget
          paused={paused}
          activeWindowSamples={activeWindowSamples}
          activeWindowSessions={activeWindowSessions}
          blocks={blocks}
          snapshot={snapshot}
          onPauseChange={setPaused}
          onOpenScreen={openScreenFromQuickView}
          onConfirm={confirmBlock}
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
          aiConfig={aiConfig}
          setAiConfig={setAiConfig}
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
      {active === "agent" && (
        <AgentScreen
          blocks={blocks}
          snapshot={snapshot}
          activeWindowSessions={activeWindowSessions}
          calendarEvents={calendarEvents}
          corrections={corrections}
          visualContextInsights={visualContextInsights}
          todayKey={todayKey}
          currentWeekRangeLabel={currentWeekRangeLabel}
          aiConfig={aiConfig}
        />
      )}
        </>
      )}
    </AppShell>
  );
}
