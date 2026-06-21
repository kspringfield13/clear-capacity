import { Check, CalendarCheck } from "lucide-react";
import type {
  WorkBlock,
  UserCorrection,
  ReviewCopilotSuggestion
} from "../../../../../packages/domain/src/models";
import { BlockCard } from "../ledger/BlockCard";
import { EmptyState } from "../common/EmptyState";
import { CorrectionHistory } from "./CorrectionHistory";
import { ReviewCopilotPanel } from "./ReviewCopilotPanel";

export function DailyReviewScreen({
  blocks,
  corrections,
  reviewSuggestions,
  reviewCopilotStatus,
  reviewCopilotError,
  onGenerateReviewSuggestions,
  onApplyReviewSuggestion,
  onDismissReviewSuggestion,
  onConfirm,
  onExclude,
  onRelabel,
  onResetLocalData
}: {
  blocks: WorkBlock[];
  corrections: UserCorrection[];
  reviewSuggestions: ReviewCopilotSuggestion[];
  reviewCopilotStatus: "idle" | "generating" | "error";
  reviewCopilotError: string | null;
  onGenerateReviewSuggestions: () => void;
  onApplyReviewSuggestion: (suggestion: ReviewCopilotSuggestion) => void;
  onDismissReviewSuggestion: (suggestionId: string) => void;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: (blockId: string, field: keyof WorkBlock, value: WorkBlock[keyof WorkBlock]) => void;
  onResetLocalData: () => void;
}) {
  const reviewQueue = blocks.filter((block) => !block.user_verified);

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

  return (
    <section className="screen review-screen">
      <div className="screen-header compact">
        <div>
          <p className="eyebrow">Daily review</p>
          <h1>
            {blocks.length === 0
              ? "Nothing to review yet."
              : reviewQueue.length === 0
                ? "All local work blocks are reviewed."
                : `${reviewQueue.length} blocks need a quick look.`}
          </h1>
        </div>
        {reviewQueue.length > 0 && (
          <button className="primary-action" type="button" onClick={() => reviewQueue.forEach((block) => onConfirm(block.work_block_id))}>
            <Check size={18} />
            <span>Confirm Visible Blocks</span>
          </button>
        )}
      </div>
      <div className="review-layout">
        <div className="review-rail">
          <strong>Under 2 minutes</strong>
          <span>Confirm the obvious blocks, relabel the weird ones, exclude anything sensitive.</span>
          <div className="review-stat">
            <small>Verified</small>
            <b>{blocks.filter((block) => block.user_verified).length}/{blocks.length}</b>
          </div>
          <CorrectionHistory blocks={blocks} corrections={corrections} onResetLocalData={onResetLocalData} />
          <ReviewCopilotPanel
            reviewQueueCount={reviewQueue.length}
            suggestions={reviewSuggestions}
            status={reviewCopilotStatus}
            error={reviewCopilotError}
            onGenerate={onGenerateReviewSuggestions}
            onApply={onApplyReviewSuggestion}
            onDismiss={onDismissReviewSuggestion}
          />
        </div>
        {reviewQueue.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Everything visible is confirmed."
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
      </div>
    </section>
  );
}
