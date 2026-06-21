import { RefreshCw } from "lucide-react";
import type { ReviewCopilotSuggestion } from "../../../../../packages/domain/src/models";

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
      {suggestions.length === 0 ? (
        <span className="copilot-empty">
          {status === "generating" ? "Generating suggestions..." : "No suggestions yet."}
        </span>
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
