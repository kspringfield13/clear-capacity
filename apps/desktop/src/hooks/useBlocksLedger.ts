import { useState, useCallback } from "react";
import type {
  AuditEvent,
  WorkBlock,
  OutlookCalendarEvent,
  UserCorrection,
  ReviewCopilotSuggestion,
} from "../../../../packages/domain/src/models";

// Reason stamped on corrections that originate from a single-field manual relabel in the
// review UI (BlockCard selects). Exported so the "Undo last correction" affordance can
// scope itself to these — each is exactly one field on one block, so its inverse replays
// cleanly, unlike the multi-correction Review Copilot bulk apply.
export const MANUAL_REVIEW_ADJUSTMENT_REASON = "Manual review adjustment";

interface UseBlocksLedgerParams {
  initialBlocks: WorkBlock[];
  initialCalendarEvents: OutlookCalendarEvent[];
  initialCorrections: UserCorrection[];
  initialReviewSuggestions: ReviewCopilotSuggestion[];
  currentWeekId: string;
  isDemoMode: boolean;
  addAuditEvent: (event: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string }) => void;
}

export function useBlocksLedger(params: UseBlocksLedgerParams) {
  const {
    initialBlocks,
    initialCalendarEvents,
    initialCorrections,
    initialReviewSuggestions,
    currentWeekId,
    isDemoMode,
    addAuditEvent,
  } = params;

  const [blocks, setBlocks] = useState<WorkBlock[]>(() => initialBlocks);
  const [calendarEvents, setCalendarEvents] = useState<OutlookCalendarEvent[]>(() => initialCalendarEvents);
  const [corrections, setCorrections] = useState<UserCorrection[]>(() => initialCorrections);
  const [reviewSuggestions, setReviewSuggestions] = useState<ReviewCopilotSuggestion[]>(() => initialReviewSuggestions);

  // Internal add correction (simplified)
  const addCorrection = useCallback((correction: Omit<UserCorrection, "correction_id" | "timestamp">) => {
    const timestamp = new Date().toISOString();
    const fullCorrection = {
      ...correction,
      correction_id: crypto.randomUUID(),
      timestamp,
    };

    setCorrections((current) => [...current, fullCorrection]);
    addAuditEvent({
      type: "user_correction",
      source: "review_layer",
      title: correction.field, // simplified
      summary: `${correction.old_value} -> ${correction.new_value}`,
      privacy_level: "local_only",
      timestamp,
      details: {
        ...fullCorrection,
        stored_locally: true,
        sent_to_cloud: false,
      },
    });
  }, [addAuditEvent]);

  const updateBlock = useCallback(<K extends keyof WorkBlock>(blockId: string, field: K, value: WorkBlock[K]) => {
    const oldBlock = blocks.find((block) => block.work_block_id === blockId);
    if (!oldBlock || String(oldBlock[field]) === String(value)) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.work_block_id === blockId ? { ...block, [field]: value, user_verified: false } : block
      )
    );
    addCorrection({
      work_block_id: blockId,
      field: field as UserCorrection["field"],
      old_value: String(oldBlock[field]),
      new_value: String(value),
      reason: MANUAL_REVIEW_ADJUSTMENT_REASON,
    });
  }, [blocks, addCorrection]);

  const confirmBlock = useCallback((blockId: string) => {
    const oldBlock = blocks.find((block) => block.work_block_id === blockId);
    if (!oldBlock || oldBlock.user_verified) {
      return;
    }

    setBlocks((current) =>
      current.map((block) => (block.work_block_id === blockId ? { ...block, user_verified: true, confidence: Math.max(block.confidence, 0.9) } : block))
    );
    addCorrection({
      work_block_id: blockId,
      field: "verification",
      old_value: "unverified",
      new_value: "verified",
      reason: "User confirmed inferred block",
    });
  }, [blocks, addCorrection]);

  const excludeBlock = useCallback((blockId: string) => {
    const oldBlock = blocks.find((block) => block.work_block_id === blockId);
    if (!oldBlock) {
      return;
    }

    setBlocks((current) => current.filter((block) => block.work_block_id !== blockId));
    addCorrection({
      work_block_id: blockId,
      field: "exclude",
      old_value: oldBlock.project_name,
      new_value: "excluded",
      reason: "User excluded sensitive or irrelevant block",
    });
  }, [blocks, addCorrection]);

  // Expose setters for more complex cases like AI results
  return {
    blocks,
    setBlocks,
    calendarEvents,
    setCalendarEvents,
    corrections,
    setCorrections,
    reviewSuggestions,
    setReviewSuggestions,
    updateBlock,
    confirmBlock,
    excludeBlock,
    addCorrection,
  };
}
