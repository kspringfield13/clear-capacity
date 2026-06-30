import { Sparkles } from "lucide-react";
import type { ReviewCopilotSuggestion } from "../../../../../packages/domain/src/models";
import { reviewActionLabel } from "../../lib/format";
import { InlineError } from "../common/InlineError";

export function ReviewCopilotPanel({
  suggestions,
  status,
  error,
  onGenerate,
  onApply,
  onDismiss
}: {
  suggestions: ReviewCopilotSuggestion[];
  status: "idle" | "generating" | "error";
  error: string | null;
  onGenerate: () => void;
  onApply: (suggestion: ReviewCopilotSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}) {
  const isGenerating = status === "generating";

  // The trigger lives in the screen header — this panel only renders results,
  // and stays out of the way entirely until there's something to show.
  if (!isGenerating && suggestions.length === 0 && !error) {
    return null;
  }

  return (
    <section className="copilot-inline">
      <div className="copilot-inline-head">
        <Sparkles size={15} />
        <strong>Suggested cleanup</strong>
        <span className="copilot-inline-sub">AI-proposed — you approve every change.</span>
      </div>
      {error && <InlineError message={error} onRetry={onGenerate} />}
      {isGenerating && suggestions.length === 0 ? (
        <div className="copilot-skeleton">
          {[0, 1, 2].map((i) => (
            <div className="copilot-skeleton-item" key={i}>
              <span className="skeleton-line" style={{ height: 14, width: "60%" }} />
              <span className="skeleton-line" style={{ height: 11, width: "40%" }} />
              <span className="skeleton-line" style={{ height: 11, width: "85%" }} />
              <span className="skeleton-line" style={{ height: 11, width: "70%" }} />
            </div>
          ))}
        </div>
      ) : (
        <ol className="copilot-list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.suggestion_id}>
              <div>
                <strong>{suggestion.title}</strong>
                <span>
                  {reviewActionLabel(suggestion.action)} ·{" "}
                  <span title="How confident the AI is in this suggested cleanup action">
                    {Math.round(suggestion.confidence * 100)}%
                    <span className="sr-only"> — how confident the AI is in this suggested cleanup action</span>
                  </span>
                </span>
              </div>
              <p>{suggestion.rationale}</p>
              <small>{suggestion.work_block_ids.length} block{suggestion.work_block_ids.length === 1 ? "" : "s"}</small>
              <div className="copilot-actions">
                <button type="button" aria-label={`Apply suggestion: ${suggestion.title}`} onClick={() => onApply(suggestion)}>Apply Suggestion</button>
                <button type="button" aria-label={`Dismiss suggestion: ${suggestion.title}`} onClick={() => onDismiss(suggestion.suggestion_id)}>Dismiss Suggestion</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
