import { Sparkles } from "lucide-react";
import type { ReviewCopilotSuggestion } from "../../../../../packages/domain/src/models";

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
      {error && (
        <div className="error-row">
          <p className="copilot-error">{error}</p>
          <button type="button" className="error-retry" onClick={onGenerate}>Try again</button>
        </div>
      )}
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
                <span>{suggestion.action} · {Math.round(suggestion.confidence * 100)}%</span>
              </div>
              <p>{suggestion.rationale}</p>
              <small>{suggestion.work_block_ids.length} block{suggestion.work_block_ids.length === 1 ? "" : "s"}</small>
              <div className="copilot-actions">
                <button type="button" onClick={() => onApply(suggestion)}>Apply Suggestion</button>
                <button type="button" onClick={() => onDismiss(suggestion.suggestion_id)}>Dismiss Suggestion</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
