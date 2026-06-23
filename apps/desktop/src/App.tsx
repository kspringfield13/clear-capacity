import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { computeWeeklyCapacitySnapshot } from "../../../packages/inference/src/capacity";
import { sessionizeActiveWindowSamples } from "../../../packages/inference/src/sessionizer/activeWindow";
import { outlookEventsToWorkBlocks, parseOutlookIcs } from "../../../packages/integrations/src/calendar/outlookIcs";
import { categoryColors, plannedStatuses, workCategories, workModes } from "../../../packages/domain/src/taxonomy";
import type {
  ActiveWindowSample,
  ActivitySession,
  AuditEvent,
  AuditEventType,
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
import { useClassification } from "./hooks/useClassification";
import { useReviewCopilot } from "./hooks/useReviewCopilot";
import { useForecastAgent } from "./hooks/useForecastAgent";
import { useNarrativeGeneration } from "./hooks/useNarrativeGeneration";
import { useVisualContext } from "./hooks/useVisualContext";

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
import { ForecastScreen } from "./components/capacity/ForecastScreen";
import { NarrativeScreen } from "./components/narrative/NarrativeScreen";
import { AuditLogScreen } from "./components/audit/AuditLogScreen";
import { CorrectionsScreen } from "./components/review/CorrectionsScreen";
import { AgentScreen } from "./components/agent/AgentScreen";

import type { Screen, WindowMode, PrimarySection, AppToolbarAction } from "./lib/types";

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
  const [visualContextAttemptedSessionIds, setVisualContextAttemptedSessionIds] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("light");
  const themeHydrated = useRef(false);
  const [windowMode, setWindowMode] = useState<WindowMode>(() =>
    isDemoMode && new URLSearchParams(window.location.search).get("mode") === "compact" ? "compact" : "large"
  );

  // Hydrate theme from persisted preference on mount; the ref prevents the
  // write-back effect from clobbering the saved value before hydration.
  useEffect(() => {
    readThemePreference().then((saved) => {
      themeHydrated.current = true;
      setTheme(saved);
    });
  }, []);

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

  const { classificationStatus, classificationError, classifyActiveWindowSessions, resetClassification } =
    useClassification({
      isDemoMode,
      blocks,
      setBlocks,
      activeWindowSessions,
      currentWeekId,
      currentWeekRangeLabel,
      visualContextInsights,
      calendarEvents,
      corrections,
      aiConfig,
      setAuditEvents,
    });

  const { reviewCopilotStatus, reviewCopilotError, generateReviewCopilotSuggestions, resetReviewCopilot } =
    useReviewCopilot({
      isDemoMode,
      blocks,
      setReviewSuggestions,
      snapshot,
      activeWindowSessions,
      currentWeekId,
      currentWeekRangeLabel,
      calendarEvents,
      corrections,
      aiConfig,
      setAuditEvents,
    });

  const { forecastStatus, forecastError, generateForecastAgent, resetForecast } = useForecastAgent({
    isDemoMode,
    blocks,
    setGeneratedForecast,
    snapshot,
    activeWindowSessions,
    currentWeekId,
    currentWeekRangeLabel,
    nextWeekId,
    nextWeekRangeLabel,
    calendarEvents,
    corrections,
    aiConfig,
    setAuditEvents,
  });

  const { narrativeGenerationStatus, narrativeGenerationError, regenerateNarrative, resetNarrative } =
    useNarrativeGeneration({
      isDemoMode,
      hasNarrativeEvidence,
      snapshot,
      blocks,
      activeWindowSessions,
      calendarEvents,
      visualContextInsights,
      corrections,
      currentWeekId,
      currentWeekRangeLabel,
      aiConfig,
      setGeneratedNarrative,
      setManagerSummaryText,
      setAuditEvents,
    });

  const { visualContextStatus, visualContextError, captureVisualContext, resetVisualContext } = useVisualContext({
    isDemoMode,
    aiConfig,
    setVisualContextInsights,
    setAuditEvents,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeHydrated.current) {
      writeThemePreference(theme);
    }
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
    const SCREEN_KEYS: Record<string, Screen> = {
      "1": "daily",
      "2": "weekly",
      "3": "forecast",
      "4": "narrative",
      "5": "ledger",
      "6": "corrections",
      "7": "audit",
      "8": "setup",
    };
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || !(event.key in SCREEN_KEYS)) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      event.preventDefault();
      setActive(SCREEN_KEYS[event.key]);
      setWindowMode("large");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    resetNarrative();
    resetClassification();
    resetReviewCopilot();
    resetForecast();
    resetVisualContext();
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
        return [{
          label: classificationStatus === "classifying" ? "Classifying…" : "Classify",
          icon: Tag,
          onClick: () => void classifyActiveWindowSessions(),
          disabled: classificationStatus === "classifying",
          tone: "primary" as const
        }];
      case "daily":
        return [{ label: "Review Copilot", icon: ShieldCheck, onClick: () => void generateReviewCopilotSuggestions(), disabled: reviewCopilotStatus === "generating" || reviewQueue.length === 0, tone: "primary" as const }];
      case "forecast":
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
          onExclude={excludeBlock}
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
          hasClassification={blocks.length > 0}
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
      {active === "corrections" && (
        <CorrectionsScreen
          blocks={blocks}
          corrections={corrections}
          onResetLocalData={resetLocalData}
        />
      )}
      {active === "daily" && (
        <DailyReviewScreen
          blocks={blocks}
          reviewSuggestions={reviewSuggestions}
          reviewCopilotStatus={reviewCopilotStatus}
          reviewCopilotError={reviewCopilotError}
          onGenerateReviewSuggestions={() => void generateReviewCopilotSuggestions()}
          onApplyReviewSuggestion={applyReviewSuggestion}
          onDismissReviewSuggestion={dismissReviewSuggestion}
          onConfirm={confirmBlock}
          onExclude={excludeBlock}
          onRelabel={updateBlock}
        />
      )}
      {active === "weekly" && (
        <WeeklyCapacityScreen
          snapshot={snapshot}
          weekRangeLabel={currentWeekRangeLabel}
          hasWorkBlocks={blocks.length > 0}
          blocks={blocks}
        />
      )}
      {active === "forecast" && (
        <ForecastScreen
          snapshot={snapshot}
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
