import { BarChart3, RefreshCw, ShieldCheck, Tag } from "lucide-react";
import type { WorkBlock } from "../../../../packages/domain/src/models";
import type { AppToolbarAction, Screen } from "./types";

interface BuildToolbarActionsParams {
  active: Screen;
  isDemoMode: boolean;
  classificationStatus: "idle" | "classifying" | "error";
  classifyActiveWindowSessions: () => void;
  reviewCopilotStatus: "idle" | "generating" | "error";
  reviewQueue: WorkBlock[];
  forecastStatus: "idle" | "generating" | "error";
  blocks: WorkBlock[];
  narrativeGenerationStatus: "idle" | "generating" | "error";
  hasNarrativeEvidence: boolean;
  generateReviewCopilotSuggestions: () => void;
  generateForecastAgent: () => void;
  regenerateNarrative: (trigger: "manual" | "auto") => void;
}

export function buildToolbarActions({
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
}: BuildToolbarActionsParams): AppToolbarAction[] {
  if (isDemoMode) return [];
  switch (active) {
    case "ledger":
      return [{
        label: classificationStatus === "classifying" ? "Classifying…" : "Classify",
        icon: Tag,
        onClick: classifyActiveWindowSessions,
        disabled: classificationStatus === "classifying",
        tone: "primary",
      }];
    case "daily":
      return [{
        label: "Review Copilot",
        icon: ShieldCheck,
        onClick: generateReviewCopilotSuggestions,
        disabled: reviewCopilotStatus === "generating" || reviewQueue.length === 0,
        tone: "primary",
      }];
    case "forecast":
      return [{
        label: "Forecast",
        icon: BarChart3,
        onClick: generateForecastAgent,
        disabled: forecastStatus === "generating" || blocks.length === 0,
        tone: "primary",
      }];
    case "narrative":
      return [{
        label: "Regenerate",
        icon: RefreshCw,
        onClick: () => regenerateNarrative("manual"),
        disabled: narrativeGenerationStatus === "generating" || !hasNarrativeEvidence,
        tone: "primary",
      }];
    default:
      return [];
  }
}
