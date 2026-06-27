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
import type { computeWeeklyCapacitySnapshot, generateWeeklyNarrative } from "../../../../../packages/inference/src/capacity";

import { CompactWidget } from "../compact/CompactWidget";
import { SetupScreen } from "../settings/SetupScreen";
import { LedgerScreen } from "../ledger/LedgerScreen";
import { CorrectionsScreen } from "../review/CorrectionsScreen";
import { DailyReviewScreen } from "../review/DailyReviewScreen";
import { WeeklyCapacityScreen } from "../capacity/WeeklyCapacityScreen";
import { ForecastScreen } from "../capacity/ForecastScreen";
import { NarrativeScreen } from "../narrative/NarrativeScreen";
import { AuditLogScreen } from "../audit/AuditLogScreen";
import { AgentScreen } from "../agent/AgentScreen";

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
  // setup screen
  visualContextEnabled: boolean;
  setVisualContextEnabled: (value: boolean) => void;
  visualContextInsights: VisualContextInsight[];
  calendarEvents: OutlookCalendarEvent[];
  captureError: string | null;
  importError: string | null;
  onImportOutlookIcs: (file: File) => void;
  aiConfig: AIConfig | null;
  setAiConfig: (value: AIConfig | null) => void;
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
  visualContextEnabled,
  setVisualContextEnabled,
  visualContextInsights,
  calendarEvents,
  captureError,
  importError,
  onImportOutlookIcs,
  aiConfig,
  setAiConfig,
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
          onResetLocalData={onResetLocalData}
        />
      )}
      {active === "daily" && (
        <DailyReviewScreen
          blocks={blocks}
          reviewSuggestions={reviewSuggestions}
          reviewCopilotStatus={reviewCopilotStatus}
          reviewCopilotError={reviewCopilotError}
          onGenerateReviewSuggestions={onGenerateReviewSuggestions}
          onApplyReviewSuggestion={onApplyReviewSuggestion}
          onDismissReviewSuggestion={onDismissReviewSuggestion}
          onConfirm={onConfirm}
          onExclude={onExclude}
          onRelabel={onRelabel}
        />
      )}
      {active === "weekly" && (
        <WeeklyCapacityScreen
          snapshot={snapshot}
          snapshotHistory={snapshotHistory}
          weekRangeLabel={weekRangeLabel}
          hasWorkBlocks={blocks.length > 0}
          blocks={blocks}
        />
      )}
      {active === "forecast" && (
        <ForecastScreen
          snapshot={snapshot}
          nextWeekRangeLabel={nextWeekRangeLabel}
          corrections={corrections}
          generatedForecast={generatedForecast}
          forecastAccuracy={forecastAccuracy}
          forecastStatus={forecastStatus}
          forecastError={forecastError}
          onGenerateForecast={onGenerateForecast}
          hasWorkBlocks={blocks.length > 0}
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
  );
}
