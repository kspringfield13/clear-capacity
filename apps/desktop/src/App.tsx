import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { outlookEventsToWorkBlocks, parseOutlookIcs } from "../../../packages/integrations/src/calendar/outlookIcs";
import { importChatExport } from "../../../packages/integrations/src/chat/chatExport";
import { dedupeChatCallsAgainstCalendar } from "../../../packages/integrations/src/chat/callDedup";
import type {
  AccelerationPlay,
  AccelerationSignal,
  ActiveWindowSample,
  AuditEvent,
  RawEvent,
  ReviewCopilotSuggestion,
  SavedSkill,
  UserCorrection,
  VisualContextInsight,
  WorkBlock,
  AIConfig
} from "../../../packages/domain/src/models";
import {
  clearPersistedState,
  readPersistedState,
  readThemePreference,
  writePersistedState,
  writeThemePreference
} from "./services/localStore";
import type { AppTheme, PersistedAccelerationRecord, PersistedAppState, PersistedForecastRecord, PersistedNarrativeRecord, PersistedSnapshotRecord } from "./services/localStore";
import { createDemoState } from "./services/demoData";
import {
  addDays,
  getCurrentIsoWeekId,
  getBusinessWeekRangeLabel,
  getLocalDateKey,
} from "./lib/date";
import { fieldLabel, humanizeCorrectionValue } from "./lib/format";
import { createAccelerationPlayAuditEvent, createAuditEvent, createChatImportAuditEvent } from "./lib/audit";
import { removeSeededCorrections, removeSeededWorkBlocks } from "./lib/blocks";
import { useDerived } from "./hooks/useDerived";
import { usePersistence } from "./hooks/usePersistence";
import { useBlocksLedger, MANUAL_REVIEW_ADJUSTMENT_REASON } from "./hooks/useBlocksLedger";
import { useActiveWindow } from "./hooks/useActiveWindow";
import { useClassification } from "./hooks/useClassification";
import { useReviewCopilot } from "./hooks/useReviewCopilot";
import { useForecastAgent } from "./hooks/useForecastAgent";
import { useAcceleration } from "./hooks/useAcceleration";
import { useNarrativeGeneration } from "./hooks/useNarrativeGeneration";
import { useVisualContext } from "./hooks/useVisualContext";
import { useProactiveAlerts } from "./hooks/useProactiveAlerts";
import {
  DEFAULT_PROACTIVE_ALERT_SETTINGS,
  EMPTY_PROACTIVE_ALERT_RUNTIME,
  type ProactiveAlertData,
  type ProactiveAlertRuntime,
  type ProactiveAlertSettings,
} from "./lib/proactiveAlerts";
import { useTrayStatus } from "./hooks/useTrayStatus";
import { useToasts } from "./hooks/useToasts";
import { screenLabels } from "./lib/ui";
import {
  MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY,
  MIN_VISUAL_CONTEXT_SESSION_MINUTES,
  MIN_VISUAL_CONTEXT_GAP_MS
} from "./lib/constants";
import { AppShell } from "./components/shell/AppShell";
import { buildToolbarActions } from "./lib/toolbarActions";
import { ScreenRouter } from "./components/shell/ScreenRouter";
import { buildOnboardingSteps } from "./components/common/OnboardingCard";
import { WalkthroughOverlay } from "./components/onboarding/WalkthroughOverlay";
import type { Screen, WindowMode } from "./lib/types";

// Correction fields whose inverse can be replayed cleanly through the relabel path
// (`updateBlock`): every entry is a string-typed `keyof WorkBlock`, so the stored
// `old_value` string is directly assignable. Deliberately excludes `blocker_flag`
// (boolean), `notes` (nullable), `start_time`/`end_time` (a single time edit records a
// start+end PAIR, so undoing "the last correction" would revert only one edge), and the
// non-relabel actions `exclude`/`verification`/`manager_summary`/`calendar_import`.
const UNDOABLE_CORRECTION_FIELDS = [
  "category",
  "mode",
  "planned_status",
  "project_name",
  "stakeholder_group"
] as const satisfies readonly (keyof WorkBlock)[];

export function App() {
  const [isDemoMode] = useState(() => new URLSearchParams(window.location.search).get("demo") === "1");
  const [persistedSnapshot, setPersistedSnapshot] = useState<PersistedAppState | null>(() => isDemoMode ? createDemoState() : null);
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
        setForecastHistory(data.forecastHistory ?? []);
        setSnapshotHistory(data.snapshotHistory ?? []);
        setChatEvents(data.chatEvents ?? []);
        setVisualContextEnabled(data.visualContextEnabled ?? false);
        setVisualContextInsights(data.visualContextInsights ?? []);
        setDismissedPlayIds(data.dismissedPlayIds ?? []);
        setSavedPlayIds(data.savedPlayIds ?? []);
        setGeneratedPlays(data.generatedPlays ?? null);
        setSavedSkills(data.savedSkills ?? []);
        setAiConfig(data.aiConfig ?? null);
        setRetentionDays(data.retentionDays ?? null);
        setOnboardingDismissed(data.onboardingDismissed ?? false);
        setWalkthroughCompleted(data.walkthroughCompleted ?? false);
        setManagerSummaryText(data.managerSummaryText ?? null);
        setGeneratedNarrative(data.generatedNarrative ?? null);
        setLastNarrativeAutoRunDate(data.lastNarrativeAutoRunDate ?? null);
        setProactiveAlertSettings(data.proactiveAlertSettings ?? DEFAULT_PROACTIVE_ALERT_SETTINGS);
        setProactiveAlertRuntime(data.proactiveAlertRuntime ?? EMPTY_PROACTIVE_ALERT_RUNTIME);
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
  const [forecastHistory, setForecastHistory] = useState<PersistedForecastRecord[]>(
    () => persistedSnapshot?.forecastHistory ?? []
  );
  const [snapshotHistory, setSnapshotHistory] = useState<PersistedSnapshotRecord[]>(
    () => persistedSnapshot?.snapshotHistory ?? []
  );
  // Imported workplace-chat events (metadata only) retained for the interruption-load signal.
  const [chatEvents, setChatEvents] = useState<RawEvent[]>(
    () => persistedSnapshot?.chatEvents ?? []
  );
  const [visualContextEnabled, setVisualContextEnabled] = useState<boolean>(
    () => persistedSnapshot?.visualContextEnabled ?? false
  );
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(
    () => persistedSnapshot?.aiConfig ?? null
  );
  const [retentionDays, setRetentionDays] = useState<number | null>(
    () => persistedSnapshot?.retentionDays ?? null
  );
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(
    () => persistedSnapshot?.onboardingDismissed ?? false
  );
  const [walkthroughCompleted, setWalkthroughCompleted] = useState<boolean>(
    () => persistedSnapshot?.walkthroughCompleted ?? false
  );
  const [visualContextInsights, setVisualContextInsights] = useState<VisualContextInsight[]>(
    () => persistedSnapshot?.visualContextInsights ?? []
  );
  // signal_ids of Acceleration Plays the user dismissed / saved. The miner re-derives
  // plays each render, so these persisted id sets are how a dismiss/save survives a reload.
  const [dismissedPlayIds, setDismissedPlayIds] = useState<string[]>(
    () => persistedSnapshot?.dismissedPlayIds ?? []
  );
  const [savedPlayIds, setSavedPlayIds] = useState<string[]>(
    () => persistedSnapshot?.savedPlayIds ?? []
  );
  // Latest AI-authored Acceleration Plays (opt-in synthesis). Persisted separately from
  // the deterministic signals (which re-derive each render) and merged back on by signal_id.
  const [generatedPlays, setGeneratedPlays] = useState<PersistedAccelerationRecord | null>(
    () => persistedSnapshot?.generatedPlays ?? null
  );
  // Durable snapshots of AUTOMATE recipes the user saved to their skills library. Keyed
  // by the source signal_id (re-saving upserts), these survive regeneration and re-mining.
  const [savedSkills, setSavedSkills] = useState<SavedSkill[]>(
    () => persistedSnapshot?.savedSkills ?? []
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
  const [proactiveAlertSettings, setProactiveAlertSettings] = useState<ProactiveAlertSettings>(
    () => persistedSnapshot?.proactiveAlertSettings ?? DEFAULT_PROACTIVE_ALERT_SETTINGS
  );
  const [proactiveAlertRuntime, setProactiveAlertRuntime] = useState<ProactiveAlertRuntime>(
    () => persistedSnapshot?.proactiveAlertRuntime ?? EMPTY_PROACTIVE_ALERT_RUNTIME
  );
  const [visualContextAttemptedSessionIds, setVisualContextAttemptedSessionIds] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [chatImportError, setChatImportError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("light");
  const themeHydrated = useRef(false);
  const [windowMode, setWindowMode] = useState<WindowMode>(() =>
    isDemoMode && new URLSearchParams(window.location.search).get("mode") === "compact" ? "compact" : "large"
  );

  // Transient app-level feedback (success/error/retry). Queue lives here so any
  // handler or effect can emit one; the visual stack is rendered once in AppShell.
  const { toasts, pushToast, dismissToast } = useToasts();

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
    chatEvents,
    activeWindowSamples,
    auditEvents,
    corrections,
    reviewSuggestions,
    generatedForecast,
    forecastHistory,
    snapshotHistory,
    visualContextEnabled,
    visualContextInsights,
    dismissedPlayIds,
    savedPlayIds,
    generatedPlays,
    savedSkills,
    aiConfig,
    managerSummaryText,
    generatedNarrative,
    lastNarrativeAutoRunDate,
    paused,
    retentionDays,
    onboardingDismissed,
    walkthroughCompleted,
    proactiveAlertSettings,
    proactiveAlertRuntime,
    isDemoMode,
  });

  useActiveWindow({
    isDemoMode,
    setActiveWindowSamples,
    setAuditEvents,
  });

  const derived = useDerived({
    blocks,
    chatEvents,
    activeWindowSamples,
    calendarEvents,
    generatedNarrative,
    forecastHistory,
    snapshotHistory,
    managerSummaryText,
    currentWeekId,
    currentWeekRangeLabel,
    nextWeekRangeLabel,
  });

  const {
    snapshot,
    narrative,
    managerText,
    activeWindowSessions,
    hasNarrativeEvidence,
    todayKey,
    reviewQueue,
    toolbarStatus,
    forecastAccuracy,
    forecastAccuracyTrend,
    forecastTrackRecord,
    interruptionLoad,
    chatStakeholders,
    accelerationSignals,
  } = derived;

  // Retain the latest computed snapshot per ISO week so cross-week trends and
  // personal baselines have history to read. Mirrors `forecastHistory`: one record
  // per week_id (latest wins), capped to the most recent 24 weeks. Once the ISO
  // week rolls over the prior week's last snapshot stops updating and stays frozen.
  useEffect(() => {
    if (isDemoMode || blocks.length === 0) return;
    setSnapshotHistory((current) => {
      const existing = current.find((entry) => entry.week_id === snapshot.week_id);
      if (existing && JSON.stringify(existing.snapshot) === JSON.stringify(snapshot)) {
        return current;
      }
      const record: PersistedSnapshotRecord = {
        week_id: snapshot.week_id,
        snapshot,
        computed_at: new Date().toISOString(),
      };
      return [...current.filter((entry) => entry.week_id !== snapshot.week_id), record]
        .sort((left, right) => left.week_id.localeCompare(right.week_id))
        .slice(-24);
    });
  }, [snapshot, blocks.length, isDemoMode]);

  // Retention policy: auto-expire raw activity older than the user-chosen window
  // (null = keep everything). This covers both the raw active-window samples and the
  // retained chat `RawEvent` store (each grows one-row-per-event, so both must be
  // pruned or the chat history would accumulate forever). Sessions and work blocks
  // already derived from these are untouched — only the raw rows expire. The effect
  // re-runs as rows accrue; each functional update returns the same reference when
  // nothing crosses the cutoff, so this never loops. The discrete policy change is
  // audited in `changeRetentionDays`; the per-row expiry is not logged (it would
  // flood the capped audit trail as rows continuously age past the cutoff).
  useEffect(() => {
    if (isDemoMode || retentionDays === null) return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    setActiveWindowSamples((current) => {
      const kept = current.filter((sample) => new Date(sample.timestamp).getTime() >= cutoff);
      return kept.length === current.length ? current : kept;
    });
    setChatEvents((current) => {
      const kept = current.filter((event) => new Date(event.timestamp_end).getTime() >= cutoff);
      return kept.length === current.length ? current : kept;
    });
  }, [isDemoMode, retentionDays, activeWindowSamples, chatEvents]);

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
    setForecastHistory,
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

  const { accelerationStatus, accelerationError, generateAccelerationPlays, resetAcceleration } =
    useAcceleration({
      isDemoMode,
      signals: accelerationSignals,
      currentWeekId,
      currentWeekRangeLabel,
      aiConfig,
      setGeneratedPlays,
      setAuditEvents,
    });

  // Merge the AI-authored payload onto the live deterministic signals by signal_id. The
  // deterministic figures (title, estimate, confidence, evidence) stay authoritative — the
  // AI only overlays the polish: a sharpened `detail`, a runnable `recipe` (AUTOMATE), and
  // `recommended_tools` (TOOL). Without a generated record every play renders deterministically
  // (recipe null / no tools). Authored entries for a signal no longer mined are simply ignored.
  const accelerationPlays = useMemo<AccelerationPlay[]>(() => {
    const authored = new Map((generatedPlays?.plays ?? []).map((play) => [play.signal_id, play]));
    return accelerationSignals.map((signal) => {
      const match = authored.get(signal.signal_id);
      return {
        ...signal,
        detail: match?.detail?.trim() ? match.detail : signal.detail,
        recipe: match?.recipe ?? null,
        skill_name: match?.skill_name ?? null,
        skill_description: match?.skill_description ?? null,
        recommended_tools: match?.recommended_tools ?? [],
        // A matched play means the opt-in AI pass authored this signal's guidance (re-whitelisted
        // to currently-mined ids upstream), so the card can attribute the prose to the AI.
        authored: Boolean(match),
        dismissed: false,
      };
    });
  }, [accelerationSignals, generatedPlays]);

  // signal_ids currently in the saved-skills library — lets the Acceleration cards mark
  // which recipes are already saved without re-scanning the array per card.
  const savedSkillIds = useMemo(() => savedSkills.map((skill) => skill.signal_id), [savedSkills]);

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

  // Surface the otherwise-swallowed AI error states as transient toasts, fired once
  // per failure cycle (the ref tracks the last-seen value, including the null reset
  // each new attempt produces, so an unchanged error never re-announces). Forecast
  // and narrative carry a Retry that re-runs their generate/regenerate handler;
  // visual-context capture is an opportunistic background pass with no idempotent
  // manual retry, so its toast is informational only.
  const prevForecastError = useRef<string | null>(null);
  useEffect(() => {
    if (forecastError && forecastError !== prevForecastError.current) {
      pushToast({
        tone: "error",
        message: forecastError,
        action: { label: "Retry", onClick: () => void generateForecastAgent() },
      });
    }
    prevForecastError.current = forecastError;
  }, [forecastError, pushToast, generateForecastAgent]);

  const prevAccelerationError = useRef<string | null>(null);
  useEffect(() => {
    if (accelerationError && accelerationError !== prevAccelerationError.current) {
      pushToast({
        tone: "error",
        message: accelerationError,
        action: { label: "Retry", onClick: () => void generateAccelerationPlays() },
      });
    }
    prevAccelerationError.current = accelerationError;
  }, [accelerationError, pushToast, generateAccelerationPlays]);

  const prevNarrativeError = useRef<string | null>(null);
  useEffect(() => {
    if (narrativeGenerationError && narrativeGenerationError !== prevNarrativeError.current) {
      pushToast({
        tone: "error",
        message: narrativeGenerationError,
        action: { label: "Retry", onClick: () => void regenerateNarrative("manual") },
      });
    }
    prevNarrativeError.current = narrativeGenerationError;
  }, [narrativeGenerationError, pushToast, regenerateNarrative]);

  const prevVisualContextError = useRef<string | null>(null);
  useEffect(() => {
    if (visualContextError && visualContextError !== prevVisualContextError.current) {
      pushToast({ tone: "error", message: visualContextError });
    }
    prevVisualContextError.current = visualContextError;
  }, [visualContextError, pushToast]);

  // Workload-derived inputs for the proactive-alert rules — all local, all
  // metrics/counts. Time-of-day fields are injected by the hook at eval time.
  const proactiveAlertData = useMemo<ProactiveAlertData>(() => {
    const tomorrowKey = getLocalDateKey(addDays(new Date(), 1));
    let tomorrowMeetingHours = 0;
    let tomorrowMeetingCount = 0;
    for (const event of calendarEvents) {
      if (getLocalDateKey(new Date(event.start_time)) !== tomorrowKey) continue;
      const hours = (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 3_600_000;
      if (Number.isFinite(hours) && hours > 0) {
        tomorrowMeetingHours += hours;
        tomorrowMeetingCount += 1;
      }
    }
    return {
      snapshot,
      hasWorkBlocks: blocks.length > 0,
      unverifiedCount: reviewQueue.length,
      tomorrowMeetingHours,
      tomorrowMeetingCount,
      weeklyArtifacts: generatedNarrative ? { signature: currentWeekId } : null,
    };
  }, [snapshot, blocks.length, reviewQueue.length, calendarEvents, generatedNarrative, currentWeekId]);

  const { activeAlert: proactiveAlert, dismissAlert: dismissProactiveAlert } = useProactiveAlerts({
    isDemoMode,
    data: proactiveAlertData,
    settings: proactiveAlertSettings,
    runtime: proactiveAlertRuntime,
    setRuntime: setProactiveAlertRuntime,
    setAuditEvents,
  });

  // Mirror a privacy-safe status line (counts/percent only) into the tray tooltip
  // so the menu bar communicates ambiently without an interruptive notification.
  useTrayStatus({
    isDemoMode,
    paused,
    hasWorkBlocks: blocks.length > 0,
    reviewCount: reviewQueue.length,
    reliableCapacityPct: snapshot.reliable_new_work_capacity_pct,
  });

  // User-initiated proactive-alert config change. A flip of the master toggle is a
  // discrete consent action, logged once (mirrors changeRetentionDays).
  function changeProactiveAlertSettings(next: ProactiveAlertSettings) {
    const previous = proactiveAlertSettings;
    setProactiveAlertSettings(next);
    if (isDemoMode || previous.enabled === next.enabled) return;
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "proactive_alert",
        source: "proactive_alerts",
        title: next.enabled ? "Proactive alerts enabled" : "Proactive alerts disabled",
        summary: next.enabled
          ? "Menu-bar capacity alerts were turned on by the user."
          : "Menu-bar capacity alerts were turned off by the user.",
        privacy_level: "local_only",
        details: {
          enabled: next.enabled,
          capacity_guardrail_enabled: next.capacityGuardrailEnabled,
          capacity_threshold_pct: next.capacityThresholdPct,
          stored_locally: true,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }

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
      "8": "sensitive",
      "9": "setup",
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

  function discardVisualInsight(insightId: string) {
    const target = visualContextInsights.find((insight) => insight.insight_id === insightId);
    if (!target) return;

    setVisualContextInsights((current) => current.filter((insight) => insight.insight_id !== insightId));
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "visual_context",
        source: "privacy_control",
        title: "Flagged capture discarded",
        summary: `Sensitive visual insight from ${target.app_name} was removed`,
        privacy_level: "local_only",
        details: {
          insight_id: target.insight_id,
          app_name: target.app_name,
          captured_at: target.captured_at,
          sensitive_content_detected: true,
          stored_locally: false,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }

  // User dismissed an Acceleration Play — hide it across reloads and log the discrete
  // action. The play's evidence is derived-only (app names/counts/ids, never window
  // titles), so the audit event is `derived_only`. No-op if already dismissed.
  function dismissPlay(signal: AccelerationSignal) {
    if (dismissedPlayIds.includes(signal.signal_id)) return;
    setDismissedPlayIds((current) =>
      current.includes(signal.signal_id) ? current : [...current, signal.signal_id]
    );
    if (isDemoMode) return;
    setAuditEvents((current) =>
      [...current, createAccelerationPlayAuditEvent({ action: "dismissed", signal })].slice(-1000)
    );
  }

  // Un-dismiss every hidden Play (the "Restore" affordance on the Acceleration screen).
  // Reversing a hide is not a discrete decision worth its own audit line, so it stays
  // unlogged (mirrors the unsave path below).
  function restoreDismissedPlays() {
    setDismissedPlayIds([]);
  }

  // User saved an Acceleration Play for later. Only the save (adding) transition is
  // audited — the Play's derived-only evidence makes it a `derived_only` event. No-op
  // if already saved so re-renders never double-log.
  function savePlay(signal: AccelerationSignal) {
    if (savedPlayIds.includes(signal.signal_id)) return;
    setSavedPlayIds((current) =>
      current.includes(signal.signal_id) ? current : [...current, signal.signal_id]
    );
    if (isDemoMode) return;
    setAuditEvents((current) =>
      [...current, createAccelerationPlayAuditEvent({ action: "saved", signal })].slice(-1000)
    );
  }

  // Remove a Play from the saved set (an undo of a save) — not audited.
  function unsavePlay(signalId: string) {
    setSavedPlayIds((current) => current.filter((id) => id !== signalId));
  }

  // Snapshot an AUTOMATE Play's AI-authored recipe into the durable skills library. Storing
  // the recipe TEXT (not just the signal_id) is what makes a generated skill reusable beyond
  // the session — it survives regeneration and the miner retiring the signal. Upserts by
  // signal_id (re-saving refreshes the snapshot). No-op without a recipe; the discrete save is
  // audited `derived_only` (the recipe is AI-authored from derived signals, never window titles).
  function saveSkill(play: AccelerationPlay) {
    if (!play.recipe) return;
    const skill: SavedSkill = {
      signal_id: play.signal_id,
      play_type: play.type,
      title: play.title,
      detail: play.detail,
      recipe: play.recipe,
      recommended_tools: play.recommended_tools,
      estimated_minutes_saved_per_week: play.estimated_minutes_saved_per_week,
      saved_at: new Date().toISOString(),
      // Snapshot the Agent Skills authoring fields so the library can export a valid SKILL.md
      // even after the signal is retired (null when the play was rendered deterministically).
      skill_name: play.skill_name,
      skill_description: play.skill_description,
    };
    setSavedSkills((current) => [
      ...current.filter((existing) => existing.signal_id !== skill.signal_id),
      skill,
    ]);
    if (isDemoMode) return;
    setAuditEvents((current) =>
      [...current, createAccelerationPlayAuditEvent({ action: "saved_to_library", signal: play })].slice(-1000)
    );
  }

  // Remove a skill from the library (an undo of a save) — not audited, mirroring unsavePlay.
  function removeSkill(signalId: string) {
    setSavedSkills((current) => current.filter((skill) => skill.signal_id !== signalId));
  }

  // User dismissed the first-run getting-started card. Persisted so the nudge stays
  // gone across reloads, and logged once as a discrete, low-noise user action.
  function dismissOnboarding() {
    if (onboardingDismissed) return;
    setOnboardingDismissed(true);
    if (isDemoMode) return;
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "onboarding",
        source: "onboarding",
        title: "Getting started dismissed",
        summary: "The first-run getting-started checklist was dismissed by the user.",
        privacy_level: "local_only",
        details: {
          stored_locally: true,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }

  // First-run app walkthrough finished or skipped. Persisted so the overlay
  // stays gone across reloads, and logged once as a discrete onboarding action.
  // `outcome` distinguishes a completed tour from an early skip in the audit
  // trail without adding a second event type.
  function endWalkthrough(outcome: "completed" | "skipped") {
    if (walkthroughCompleted) return;
    setWalkthroughCompleted(true);
    if (isDemoMode) return;
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "onboarding",
        source: "walkthrough",
        title: outcome === "completed" ? "App walkthrough completed" : "App walkthrough skipped",
        summary:
          outcome === "completed"
            ? "The first-run guided tour of the app was completed by the user."
            : "The first-run guided tour of the app was skipped by the user.",
        privacy_level: "local_only",
        details: {
          outcome,
          stored_locally: true,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }

  // Let the user replay the guided tour from Settings.
  function replayWalkthrough() {
    setWalkthroughCompleted(false);
  }

  // User-initiated retention-window change. Logged once as a discrete privacy
  // action (the background per-sample expiry deliberately stays unlogged).
  function changeRetentionDays(value: number | null) {
    setRetentionDays(value);
    if (isDemoMode) return;
    setAuditEvents((current) => [
      ...current,
      createAuditEvent({
        type: "retention_policy",
        source: "privacy_control",
        title: "Activity retention updated",
        summary: value === null
          ? "Automatic sample expiry disabled — samples are kept until reset"
          : `Active-window samples now auto-expire after ${value} days`,
        privacy_level: "local_only",
        details: {
          retention_days: value,
          stored_locally: true,
          sent_to_cloud: false
        }
      })
    ].slice(-1000));
  }

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
        summary: `${humanizeCorrectionValue(fullCorrection.field, fullCorrection.old_value)} → ${humanizeCorrectionValue(fullCorrection.field, fullCorrection.new_value)}`,
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

  // The most recent correction, when it can be cleanly reverted through the relabel path:
  // it came from a single-field manual relabel (not the multi-correction Review Copilot
  // bulk apply), it's today's, edits an undoable field, and its target block still exists
  // AND still holds the changed value (so the revert actually does something — no lying
  // "Reverted…" toast if an AI reclassification already moved the field back).
  const lastCorrection = corrections.length > 0 ? corrections[corrections.length - 1] : null;
  const undoTargetBlock =
    lastCorrection && lastCorrection.reason === MANUAL_REVIEW_ADJUSTMENT_REASON
      ? blocks.find((block) => block.work_block_id === lastCorrection.work_block_id)
      : undefined;
  const canUndoLastCorrection = Boolean(
    lastCorrection &&
      undoTargetBlock &&
      getLocalDateKey(new Date(lastCorrection.timestamp)) === getLocalDateKey() &&
      (UNDOABLE_CORRECTION_FIELDS as readonly string[]).includes(lastCorrection.field) &&
      String(undoTargetBlock[lastCorrection.field as (typeof UNDOABLE_CORRECTION_FIELDS)[number]]) !==
        lastCorrection.old_value
  );

  function undoLastCorrection() {
    if (!lastCorrection || !canUndoLastCorrection) {
      return;
    }
    // Re-apply the prior value via the same relabel path — this records the reversal
    // as a fresh (inverse) correction + audit event, so it stays explainable and redoable.
    updateBlock(
      lastCorrection.work_block_id,
      lastCorrection.field as (typeof UNDOABLE_CORRECTION_FIELDS)[number],
      lastCorrection.old_value
    );
    pushToast({
      tone: "success",
      message: `Reverted ${fieldLabel(lastCorrection.field)} to ${humanizeCorrectionValue(
        lastCorrection.field,
        lastCorrection.old_value
      )}`
    });
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
    setForecastHistory([]);
    setSnapshotHistory([]);
    setChatEvents([]);
    setVisualContextEnabled(true);
    setVisualContextInsights([]);
    setVisualContextAttemptedSessionIds([]);
    setDismissedPlayIds([]);
    setSavedPlayIds([]);
    setGeneratedPlays(null);
    setSavedSkills([]);
    setRetentionDays(null);
    setOnboardingDismissed(false);
    setManagerSummaryText(null);
    setGeneratedNarrative(null);
    setLastNarrativeAutoRunDate(null);
    setProactiveAlertSettings(DEFAULT_PROACTIVE_ALERT_SETTINGS);
    setProactiveAlertRuntime(EMPTY_PROACTIVE_ALERT_RUNTIME);
    resetNarrative();
    resetClassification();
    resetReviewCopilot();
    resetForecast();
    resetAcceleration();
    resetVisualContext();
    setImportError(null);
    setChatImportError(null);
    setCaptureError(null);
    setPaused(true);
  }

  function importOutlookIcs(file: File) {
    setImportError(null);
    const reader = new FileReader();

    const failImport = (message: string) => {
      setImportError(message);
      pushToast({ tone: "error", message });
    };

    reader.onerror = () => {
      failImport("Could not read that Outlook export.");
    };

    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        const importedEvents = parseOutlookIcs(content);

        if (importedEvents.length === 0) {
          failImport("No usable calendar events were found in that .ics file.");
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
          const calendarBlocks = outlookEventsToWorkBlocks([...currentEvents.values()], currentWeekId);
          // Symmetric dedup: importing the calendar after a chat export must also
          // drop any previously-imported chat call block now covered by a calendar
          // meeting, so the order of the two imports never double-counts the call.
          const importedBlocks = nonCalendarBlocks.filter((block) => block.work_block_id.startsWith("imported-"));
          const otherBlocks = nonCalendarBlocks.filter((block) => !block.work_block_id.startsWith("imported-"));
          const { kept } = dedupeChatCallsAgainstCalendar(importedBlocks, calendarBlocks);
          return [...otherBlocks, ...kept, ...calendarBlocks].sort(
            (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
          );
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
        pushToast({
          tone: "success",
          message: `${importedEvents.length} event${importedEvents.length === 1 ? "" : "s"} imported`,
        });
      } catch {
        failImport("The .ics file could not be parsed.");
      }
    };

    reader.readAsText(file);
  }

  function importWorkplaceChat(file: File) {
    setChatImportError(null);
    const reader = new FileReader();

    const failImport = (message: string) => {
      setChatImportError(message);
      pushToast({ tone: "error", message });
    };

    reader.onerror = () => {
      failImport("Could not read that chat export.");
    };

    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        // Metadata-only: importChatExport whitelists timestamps/channels/counts and
        // has no message-text field, so message bodies can never enter the ledger.
        const result = importChatExport(content, { weekId: currentWeekId });

        if (result.work_blocks.length === 0) {
          failImport("No usable chat activity was found in that export.");
          return;
        }

        // Drop chat call/huddle meeting blocks that overlap a meeting already on
        // the calendar, so a Teams/Webex call on both isn't double-counted in
        // meeting_pct. Reactive blocks are always kept.
        const { kept, deduped } = dedupeChatCallsAgainstCalendar(result.work_blocks, blocks);

        if (kept.length > 0) {
          setBlocks((current) => {
            // Imported blocks carry stable ids (`imported-<hash>`), so re-importing
            // the same export upserts rather than duplicating.
            const merged = new Map(current.map((block) => [block.work_block_id, block]));
            kept.forEach((block) => merged.set(block.work_block_id, block));
            return [...merged.values()].sort(
              (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
            );
          });

          // Retain the metadata-only chat events (deduped by event_id) so the
          // interruption-load signal survives a reload — but only the reactive text
          // bursts, not call/huddle meetings (those are meeting blocks, not
          // interruptions). NO message text is stored.
          const reactiveEvents = result.events.filter((event) => event.metadata?.kind !== "call");
          setChatEvents((current) => {
            const merged = new Map(current.map((event) => [event.event_id, event]));
            reactiveEvents.forEach((event) => merged.set(event.event_id, event));
            return [...merged.values()].sort(
              (left, right) =>
                new Date(left.timestamp_start).getTime() - new Date(right.timestamp_start).getTime()
            );
          });
        }

        // Audit every import attempt, including one where every block was a call
        // already covered by the calendar (a user-visible decision that changed
        // what was imported).
        setAuditEvents((current) => [
          ...current,
          createChatImportAuditEvent({
            fileName: file.name,
            importedBlockCount: kept.length,
            skippedRecordCount: result.skipped
          })
        ].slice(-1000));
        pushToast({
          tone: kept.length === 0 ? "info" : "success",
          message:
            kept.length === 0
              ? `${deduped.length} chat call${deduped.length === 1 ? "" : "s"} already on your calendar — nothing new imported`
              : deduped.length > 0
                ? `${kept.length} block${kept.length === 1 ? "" : "s"} imported · ${deduped.length} call${deduped.length === 1 ? "" : "s"} already on your calendar`
                : `${kept.length} block${kept.length === 1 ? "" : "s"} imported`,
        });
      } catch {
        failImport("That chat export could not be parsed.");
      }
    };

    reader.readAsText(file);
  }

  function openScreenFromQuickView(screen: Screen) {
    setActive(screen);
    setWindowMode("large");
  }

  // First-run guidance shown on the empty daily/weekly screens. Shares its step
  // definitions with the Settings checklist via `buildOnboardingSteps`.
  const onboardingSteps = useMemo(
    () =>
      buildOnboardingSteps({
        trackingActive: !paused && activeWindowSamples.length > 0,
        calendarImported: calendarEvents.length > 0,
        aiConfigured: Boolean(aiConfig?.apiKey),
        classified: blocks.length > 0,
      }),
    [paused, activeWindowSamples.length, calendarEvents.length, aiConfig?.apiKey, blocks.length]
  );
  const showOnboarding = !isDemoMode && !onboardingDismissed && blocks.length === 0;
  // The guided tour spotlights the sidebar nav, so it only runs in the full
  // window (the compact menu-bar widget has no nav) and never in demo mode.
  const showWalkthrough = !isDemoMode && windowMode === "large" && !walkthroughCompleted;

  const toolbarActions = buildToolbarActions({
    active,
    isDemoMode,
    classificationStatus,
    classifyActiveWindowSessions,
    reviewCopilotStatus,
    reviewQueue,
    forecastStatus,
    blocks,
    narrativeGenerationStatus,
    hasNarrativeEvidence,
    generateReviewCopilotSuggestions,
    generateForecastAgent,
    regenerateNarrative,
  });

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
      toasts={toasts}
      onDismissToast={dismissToast}
    >
      <ScreenRouter
        active={active}
        windowMode={windowMode}
        paused={paused}
        setPaused={setPaused}
        blocks={blocks}
        activeWindowSamples={activeWindowSamples}
        activeWindowSessions={activeWindowSessions}
        snapshot={snapshot}
        snapshotHistory={snapshotHistory}
        interruptionLoad={interruptionLoad}
        chatStakeholders={chatStakeholders}
        accelerationPlays={accelerationPlays}
        dismissedPlayIds={dismissedPlayIds}
        savedPlayIds={savedPlayIds}
        onDismissPlay={dismissPlay}
        onSavePlay={savePlay}
        onUnsavePlay={unsavePlay}
        onRestoreDismissedPlays={restoreDismissedPlays}
        savedSkills={savedSkills}
        savedSkillIds={savedSkillIds}
        onSaveSkill={saveSkill}
        onRemoveSkill={removeSkill}
        accelerationStatus={accelerationStatus}
        accelerationError={accelerationError}
        onGenerateAccelerationPlays={() => void generateAccelerationPlays()}
        accelerationConfigured={Boolean(aiConfig?.apiKey?.trim())}
        accelerationGeneratedAt={generatedPlays?.generated_at ?? null}
        hasAuthoredPlays={(generatedPlays?.plays.length ?? 0) > 0}
        onConfirm={confirmBlock}
        onExclude={excludeBlock}
        onRelabel={updateBlock}
        onUndoLastCorrection={undoLastCorrection}
        canUndoLastCorrection={canUndoLastCorrection}
        onOpenScreen={openScreenFromQuickView}
        onboardingSteps={onboardingSteps}
        showOnboarding={showOnboarding}
        onDismissOnboarding={dismissOnboarding}
        visualContextEnabled={visualContextEnabled}
        setVisualContextEnabled={setVisualContextEnabled}
        visualContextInsights={visualContextInsights}
        onDiscardInsight={discardVisualInsight}
        calendarEvents={calendarEvents}
        captureError={captureError}
        importError={importError}
        onImportOutlookIcs={importOutlookIcs}
        chatImportError={chatImportError}
        onImportChatExport={importWorkplaceChat}
        aiConfig={aiConfig}
        setAiConfig={setAiConfig}
        retentionDays={retentionDays}
        setRetentionDays={changeRetentionDays}
        proactiveAlert={proactiveAlert}
        onDismissProactiveAlert={dismissProactiveAlert}
        proactiveAlertSettings={proactiveAlertSettings}
        onProactiveAlertSettingsChange={changeProactiveAlertSettings}
        classificationStatus={classificationStatus}
        classificationError={classificationError}
        visualContextStatus={visualContextStatus}
        visualContextError={visualContextError}
        onClassifySessions={() => void classifyActiveWindowSessions()}
        corrections={corrections}
        onResetLocalData={resetLocalData}
        reviewSuggestions={reviewSuggestions}
        reviewCopilotStatus={reviewCopilotStatus}
        reviewCopilotError={reviewCopilotError}
        onGenerateReviewSuggestions={() => void generateReviewCopilotSuggestions()}
        onApplyReviewSuggestion={applyReviewSuggestion}
        onDismissReviewSuggestion={dismissReviewSuggestion}
        weekRangeLabel={currentWeekRangeLabel}
        nextWeekRangeLabel={nextWeekRangeLabel}
        generatedForecast={generatedForecast}
        forecastAccuracy={forecastAccuracy}
        forecastAccuracyTrend={forecastAccuracyTrend}
        forecastTrackRecord={forecastTrackRecord}
        forecastStatus={forecastStatus}
        forecastError={forecastError}
        onGenerateForecast={() => void generateForecastAgent()}
        narrative={narrative}
        generatedNarrative={generatedNarrative}
        hasNarrativeEvidence={hasNarrativeEvidence}
        narrativeGenerationStatus={narrativeGenerationStatus}
        narrativeGenerationError={narrativeGenerationError}
        managerSummaryText={managerSummaryText}
        onManagerSummaryChange={updateManagerSummary}
        onRegenerate={() => void regenerateNarrative("manual")}
        auditEvents={auditEvents}
        todayKey={todayKey}
        currentWeekRangeLabel={currentWeekRangeLabel}
        onReplayWalkthrough={replayWalkthrough}
        pushToast={pushToast}
      />
      {showWalkthrough && (
        <WalkthroughOverlay
          onComplete={() => endWalkthrough("completed")}
          onSkip={() => endWalkthrough("skipped")}
        />
      )}
    </AppShell>
  );
}
