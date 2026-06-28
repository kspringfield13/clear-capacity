import type { Screen, WindowMode } from "../../lib/types";
import type {
  ActiveWindowSample,
  ActivitySession,
  AuditEvent,
  OutlookCalendarEvent,
  ReviewCopilotSuggestion,
  UserCorrection,
  VisualContextInsight,
  WorkBlock,
  AIConfig,
} from "../../../../../packages/domain/src/models";
import type { PersistedForecastRecord, PersistedNarrativeRecord, ForecastAccuracyReview, PersistedSnapshotRecord } from "../../services/localStore";
import type { computeWeeklyCapacitySnapshot, generateWeeklyNarrative, ForecastAccuracyTrend, ForecastTrackRecordEntry } from "../../../../../packages/inference/src/capacity";

import { CompactWidget } from "../compact/CompactWidget";
import { SetupScreen } from "../settings/SetupScreen";
import { LedgerScreen } from "../ledger/LedgerScreen";
import { CorrectionsScreen } from "../review/CorrectionsScreen";
import { DailyReviewScreen } from "../review/DailyReviewScreen";
import { WeeklyCapacityScreen } from "../capacity/WeeklyCapacityScreen";
import { ForecastScreen } from "../capacity/ForecastScreen";
import { TrendsScreen } from "../capacity/TrendsScreen";
import { NarrativeScreen } from "../narrative/NarrativeScreen";
import { AuditLogScreen } from "../audit/AuditLogScreen";
import { SensitiveReviewScreen } from "../audit/SensitiveReviewScreen";
import { AgentScreen } from "../agent/AgentScreen";
import type { OnboardingStep } from "../common/OnboardingCard";
import type { ProactiveAlert, ProactiveAlertSettings } from "../../lib/proactiveAlerts";
import type { PushToast } from "../../hooks/useToasts";

interface ScreenRouterProps {
  active: Screen;
  windowMode: WindowMode;
  // shared
  paused: boolean;
  setPaused: (value: boolean) => void;
  blocks: WorkBlock[];
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  snapshotHistory: PersistedSnapshotRecord[];
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: (blockId: string, field: keyof WorkBlock, value: WorkBlock[keyof WorkBlock]) => void;
  onOpenScreen: (screen: Screen) => void;
  // first-run onboarding
  onboardingSteps: OnboardingStep[];
  showOnboarding: boolean;
  onDismissOnboarding: () => void;
  // setup screen
  visualContextEnabled: boolean;
  setVisualContextEnabled: (value: boolean) => void;
  visualContextInsights: VisualContextInsight[];
  onDiscardInsight: (insightId: string) => void;
  calendarEvents: OutlookCalendarEvent[];
  captureError: string | null;
  importError: string | null;
  onImportOutlookIcs: (file: File) => void;
  aiConfig: AIConfig | null;
  setAiConfig: (value: AIConfig | null) => void;
  retentionDays: number | null;
  setRetentionDays: (value: number | null) => void;
  // proactive alerts (compact widget + setup screen)
  proactiveAlert: ProactiveAlert | null;
  onDismissProactiveAlert: () => void;
  proactiveAlertSettings: ProactiveAlertSettings;
  onProactiveAlertSettingsChange: (value: ProactiveAlertSettings) => void;
  // ledger screen
  classificationStatus: "idle" | "classifying" | "error";
  classificationError: string | null;
  visualContextStatus: "idle" | "capturing" | "error";
  visualContextError: string | null;
  onClassifySessions: () => void;
  // corrections screen
  corrections: UserCorrection[];
  onResetLocalData: () => void;
  // daily review screen
  reviewSuggestions: ReviewCopilotSuggestion[];
  reviewCopilotStatus: "idle" | "generating" | "error";
  reviewCopilotError: string | null;
  onGenerateReviewSuggestions: () => void;
  onApplyReviewSuggestion: (suggestion: ReviewCopilotSuggestion) => void;
  onDismissReviewSuggestion: (suggestionId: string) => void;
  // weekly capacity + forecast
  weekRangeLabel: string;
  nextWeekRangeLabel: string;
  // forecast screen
  generatedForecast: PersistedForecastRecord | null;
  forecastAccuracy: ForecastAccuracyReview | null;
  forecastAccuracyTrend: ForecastAccuracyTrend | null;
  forecastTrackRecord: ForecastTrackRecordEntry[];
  forecastStatus: "idle" | "generating" | "error";
  forecastError: string | null;
  onGenerateForecast: () => void;
  // narrative screen
  narrative: ReturnType<typeof generateWeeklyNarrative>;
  generatedNarrative: PersistedNarrativeRecord | null;
  hasNarrativeEvidence: boolean;
  narrativeGenerationStatus: "idle" | "generating" | "error";
  narrativeGenerationError: string | null;
  managerSummaryText: string | null;
  onManagerSummaryChange: (value: string) => void;
  onRegenerate: () => void;
  // audit log screen
  auditEvents: AuditEvent[];
  // agent screen
  todayKey: string;
  currentWeekRangeLabel: string;
  // transient feedback
  pushToast: PushToast;
}

export function ScreenRouter({
  active,
  windowMode,
  paused,
  setPaused,
  blocks,
  activeWindowSamples,
  activeWindowSessions,
  snapshot,
  snapshotHistory,
  onConfirm,
  onExclude,
  onRelabel,
  onOpenScreen,
  onboardingSteps,
  showOnboarding,
  onDismissOnboarding,
  visualContextEnabled,
  setVisualContextEnabled,
  visualContextInsights,
  onDiscardInsight,
  calendarEvents,
  captureError,
  importError,
  onImportOutlookIcs,
  aiConfig,
  setAiConfig,
  retentionDays,
  setRetentionDays,
  proactiveAlert,
  onDismissProactiveAlert,
  proactiveAlertSettings,
  onProactiveAlertSettingsChange,
  classificationStatus,
  classificationError,
  visualContextStatus,
  visualContextError,
  onClassifySessions,
  corrections,
  onResetLocalData,
  reviewSuggestions,
  reviewCopilotStatus,
  reviewCopilotError,
  onGenerateReviewSuggestions,
  onApplyReviewSuggestion,
  onDismissReviewSuggestion,
  weekRangeLabel,
  nextWeekRangeLabel,
  generatedForecast,
  forecastAccuracy,
  forecastAccuracyTrend,
  forecastTrackRecord,
  forecastStatus,
  forecastError,
  onGenerateForecast,
  narrative,
  generatedNarrative,
  hasNarrativeEvidence,
  narrativeGenerationStatus,
  narrativeGenerationError,
  managerSummaryText,
  onManagerSummaryChange,
  onRegenerate,
  auditEvents,
  todayKey,
  currentWeekRangeLabel,
  pushToast,
}: ScreenRouterProps) {
  if (windowMode === "compact") {
    return (
      <CompactWidget
        paused={paused}
        activeWindowSamples={activeWindowSamples}
        activeWindowSessions={activeWindowSessions}
        blocks={blocks}
        snapshot={snapshot}
        onPauseChange={setPaused}
        onOpenScreen={onOpenScreen}
        onConfirm={onConfirm}
        onExclude={onExclude}
        proactiveAlert={proactiveAlert}
        onDismissProactiveAlert={onDismissProactiveAlert}
      />
    );
  }

  return (
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
          onImportOutlookIcs={onImportOutlookIcs}
          aiConfig={aiConfig}
          setAiConfig={setAiConfig}
          hasClassification={blocks.length > 0}
          blocks={blocks}
          auditEvents={auditEvents}
          retentionDays={retentionDays}
          setRetentionDays={setRetentionDays}
          proactiveAlertSettings={proactiveAlertSettings}
          onProactiveAlertSettingsChange={onProactiveAlertSettingsChange}
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
          onClassifySessions={onClassifySessions}
          onConfirm={onConfirm}
          onExclude={onExclude}
          onRelabel={onRelabel}
        />
      )}
      {active === "corrections" && (
        <CorrectionsScreen
          blocks={blocks}
          corrections={corrections}
          auditEvents={auditEvents}
          onResetLocalData={onResetLocalData}
        />
      )}
      {active === "daily" && (
        <DailyReviewScreen
          blocks={blocks}
          onboardingSteps={onboardingSteps}
          showOnboarding={showOnboarding}
          onDismissOnboarding={onDismissOnboarding}
          onOpenScreen={onOpenScreen}
          reviewSuggestions={reviewSuggestions}
          reviewCopilotStatus={reviewCopilotStatus}
          reviewCopilotError={reviewCopilotError}
          onGenerateReviewSuggestions={onGenerateReviewSuggestions}
          onApplyReviewSuggestion={onApplyReviewSuggestion}
          onDismissReviewSuggestion={onDismissReviewSuggestion}
          onConfirm={onConfirm}
          onExclude={onExclude}
          onRelabel={onRelabel}
          corrections={corrections}
          pushToast={pushToast}
        />
      )}
      {active === "weekly" && (
        <WeeklyCapacityScreen
          snapshot={snapshot}
          snapshotHistory={snapshotHistory}
          weekRangeLabel={weekRangeLabel}
          hasWorkBlocks={blocks.length > 0}
          blocks={blocks}
          onboardingSteps={onboardingSteps}
          showOnboarding={showOnboarding}
          onDismissOnboarding={onDismissOnboarding}
          onOpenScreen={onOpenScreen}
        />
      )}
      {active === "forecast" && (
        <ForecastScreen
          snapshot={snapshot}
          nextWeekRangeLabel={nextWeekRangeLabel}
          onOpenScreen={onOpenScreen}
          corrections={corrections}
          generatedForecast={generatedForecast}
          forecastAccuracy={forecastAccuracy}
          forecastAccuracyTrend={forecastAccuracyTrend}
          forecastStatus={forecastStatus}
          forecastError={forecastError}
          onGenerateForecast={onGenerateForecast}
          hasWorkBlocks={blocks.length > 0}
        />
      )}
      {active === "trends" && (
        <TrendsScreen
          snapshot={snapshot}
          snapshotHistory={snapshotHistory}
          forecastTrackRecord={forecastTrackRecord}
          forecastAccuracyTrend={forecastAccuracyTrend}
          hasWorkBlocks={blocks.length > 0}
          onOpenScreen={onOpenScreen}
        />
      )}
      {active === "narrative" && (
        <NarrativeScreen
          narrative={narrative}
          generatedNarrative={generatedNarrative}
          weekRangeLabel={weekRangeLabel}
          hasNarrativeEvidence={hasNarrativeEvidence}
          generationStatus={narrativeGenerationStatus}
          generationError={narrativeGenerationError}
          managerSummaryText={managerSummaryText}
          onManagerSummaryChange={onManagerSummaryChange}
          onRegenerate={onRegenerate}
          pushToast={pushToast}
        />
      )}
      {active === "audit" && <AuditLogScreen auditEvents={auditEvents} />}
      {active === "sensitive" && (
        <SensitiveReviewScreen
          visualContextInsights={visualContextInsights}
          onDiscardInsight={onDiscardInsight}
        />
      )}
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
          pushToast={pushToast}
        />
      )}
    </>
  );
}
