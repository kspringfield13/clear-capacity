import { RefreshCw, Sparkles } from "lucide-react";
import type { ReviewCopilotSuggestion } from "../../../../../packages/domain/src/models";
import { EmptyState } from "../common/EmptyState";

export function ReviewCopilotPanel({
  reviewQueueCount,
  suggestions,
  status,
  error,
  onGenerate,
  onApply,
  onDismiss
}: {
  reviewQueueCount: number;
  suggestions: ReviewCopilotSuggestion[];
  status: "idle" | "generating" | "error";
  error: string | null;
  onGenerate: () => void;
  onApply: (suggestion: ReviewCopilotSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
}) {
  return (
    <section className="copilot-panel">
      <div className="history-title">
        <span>
          <RefreshCw size={16} />
          <strong>Review Copilot</strong>
        </span>
        <button
          className="copilot-generate"
          type="button"
          disabled={status === "generating" || reviewQueueCount === 0}
          onClick={onGenerate}
          title="Generate review suggestions"
        >
          <RefreshCw size={15} />
          <span>{status === "generating" ? "Generating…" : "Generate Suggestions"}</span>
        </button>
      </div>
      <p>Suggests cleanup actions for unverified blocks. You approve every change.</p>
      {error && (
        <div className="error-row">
          <p className="copilot-error">{error}</p>
          <button type="button" className="error-retry" onClick={onGenerate}>Try again</button>
        </div>
      )}
      {status === "generating" && suggestions.length === 0 ? (
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
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No suggestions yet."
          description={reviewQueueCount === 0 ? "Add unconfirmed blocks to the review queue, then generate suggestions." : "Click Generate Suggestions to get AI cleanup recommendations for your unconfirmed blocks."}
        >
          {reviewQueueCount > 0 && (
            <button className="secondary-action" type="button" onClick={onGenerate}>
              <RefreshCw size={14} />
              <span>Generate Suggestions</span>
            </button>
          )}
        </EmptyState>
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
