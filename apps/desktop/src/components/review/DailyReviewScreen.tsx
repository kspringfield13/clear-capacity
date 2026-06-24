import { Check, CalendarCheck, Sparkles } from "lucide-react";
import type {
  WorkBlock,
  ReviewCopilotSuggestion
} from "../../../../../packages/domain/src/models";
import { BlockCard } from "../ledger/BlockCard";
import { EmptyState } from "../common/EmptyState";
import { ReviewCopilotPanel } from "./ReviewCopilotPanel";

export function DailyReviewScreen({
  blocks,
  reviewSuggestions,
  reviewCopilotStatus,
  reviewCopilotError,
  onGenerateReviewSuggestions,
  onApplyReviewSuggestion,
  onDismissReviewSuggestion,
  onConfirm,
  onExclude,
  onRelabel
}: {
  blocks: WorkBlock[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  reviewCopilotStatus: "idle" | "generating" | "error";
  reviewCopilotError: string | null;
  onGenerateReviewSuggestions: () => void;
  onApplyReviewSuggestion: (suggestion: ReviewCopilotSuggestion) => void;
  onDismissReviewSuggestion: (suggestionId: string) => void;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: (blockId: string, field: keyof WorkBlock, value: WorkBlock[keyof WorkBlock]) => void;
}) {
  const reviewQueue = blocks.filter((block) => !block.user_verified);
  const verifiedCount = blocks.length - reviewQueue.length;

  if (blocks.length === 0) {
    return (
      <section className="screen review-screen">
        <div className="screen-header compact">
          <div>
            <p className="eyebrow">Today</p>
            <h1>Nothing needs your attention.</h1>
          </div>
        </div>
        <EmptyState
          icon={CalendarCheck}
          title="Your review queue is empty."
          description="ClearCapacity will place inferred work here after Outlook meetings are imported or active-window sessions are classified."
        />
      </section>
    );
  }

  const allDone = reviewQueue.length === 0;
  const progressPct = Math.round((verifiedCount / blocks.length) * 100);

  return (
    <section className="screen review-screen">
      <div className="screen-header compact">
        <div>
          <p className="eyebrow">Daily review</p>
          <h1>
            {allDone
              ? "All blocks reviewed."
              : `${reviewQueue.length} block${reviewQueue.length === 1 ? "" : "s"} need a quick look.`}
          </h1>
          <p className="screen-subhead">
            Under two minutes — confirm the obvious blocks, relabel the odd ones, exclude anything sensitive.
          </p>
        </div>
        {!allDone && (
          <div className="review-header-actions">
            <button
              className="secondary-action"
              type="button"
              disabled={reviewCopilotStatus === "generating"}
              onClick={onGenerateReviewSuggestions}
              title="Ask AI to suggest cleanup actions for unconfirmed blocks"
            >
              <Sparkles size={16} />
              <span>{reviewCopilotStatus === "generating" ? "Thinking…" : "Suggest cleanup"}</span>
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={() => reviewQueue.forEach((block) => onConfirm(block.work_block_id))}
            >
              <Check size={18} />
              <span>Confirm all {reviewQueue.length}</span>
            </button>
          </div>
        )}
      </div>

      <div className="review-progress" role="status" aria-label={`${verifiedCount} of ${blocks.length} blocks verified`}>
        <span><b>{verifiedCount}</b> of {blocks.length} verified</span>
        <div className="review-progress-track">
          <div className="review-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <ReviewCopilotPanel
        suggestions={reviewSuggestions}
        status={reviewCopilotStatus}
        error={reviewCopilotError}
        onGenerate={onGenerateReviewSuggestions}
        onApply={onApplyReviewSuggestion}
        onDismiss={onDismissReviewSuggestion}
      />

      {allDone ? (
        <EmptyState
          icon={Check}
          title="Everything is confirmed."
          description="New Outlook imports and active-window-derived blocks will appear here when they need your review."
        />
      ) : (
        <div className="ledger-list">
          {reviewQueue.map((block) => (
            <BlockCard
              block={block}
              key={block.work_block_id}
              onConfirm={onConfirm}
              onExclude={onExclude}
              onRelabel={onRelabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}
