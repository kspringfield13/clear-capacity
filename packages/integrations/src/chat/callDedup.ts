import type { WorkBlock } from "../../../domain/src/models";

/**
 * De-duplicate chat-derived call/huddle meeting blocks against the meetings
 * already on the user's calendar.
 *
 * A Teams/Webex call (or Slack huddle) is frequently the *same* event as a
 * calendar invite — counting both would double-count it in the capacity model's
 * `meeting_pct`. This pure helper drops any chat call block whose span overlaps
 * a calendar-derived meeting block, keeping the calendar copy (the authoritative
 * one) and every reactive (non-meeting) chat block untouched.
 *
 * It reads only `category` + the `[start_time, end_time)` span — no message text
 * or window titles — so it preserves the chat family's metadata-only invariant.
 */

/** The single work category that represents a meeting/sync. */
const MEETING_CATEGORY: WorkBlock["category"] = "Meetings / stakeholder syncs";

/**
 * True when two half-open `[start, end)` spans (epoch ms) intersect. Spans that
 * merely touch at an endpoint (`aEnd === bStart`) do NOT overlap — adjacent
 * back-to-back meetings stay distinct.
 */
export function spansOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface Span {
  start: number;
  end: number;
}

/** Parse a block's `[start_time, end_time)` into epoch ms; `null` if unusable. */
function blockSpan(block: WorkBlock): Span | null {
  const start = new Date(block.start_time).getTime();
  const end = new Date(block.end_time).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return null;
  }
  return { start, end };
}

export interface ChatCallDedupResult {
  /** Chat blocks to keep: every reactive block + call blocks with no calendar twin. */
  kept: WorkBlock[];
  /** Chat call blocks dropped because a calendar meeting already covers their span. */
  deduped: WorkBlock[];
}

/**
 * Partition freshly-imported chat blocks into the ones to keep and the call
 * blocks that duplicate an existing calendar meeting.
 *
 * @param chatBlocks      The chat import's `work_blocks` (reactive + call blocks).
 * @param existingBlocks  Blocks already in the ledger; only their meeting blocks
 *                        are used as the dedup target. Pass the full block list —
 *                        non-meeting blocks are ignored.
 *
 * Only chat *meeting* blocks (category `Meetings / stakeholder syncs`, produced
 * from `call`/`huddle` surfaces) are eligible to be deduped; reactive chat
 * blocks are always kept. Re-importing the same export is idempotent: a call
 * that was kept becomes its own calendar twin on the second pass and dedups
 * against the stored copy, so no duplicate accrues.
 */
export function dedupeChatCallsAgainstCalendar(
  chatBlocks: WorkBlock[],
  existingBlocks: WorkBlock[]
): ChatCallDedupResult {
  // Compute the calendar meeting spans once up front (O(calls × meetings) total).
  const meetingSpans = existingBlocks
    .filter((block) => block.category === MEETING_CATEGORY)
    .map(blockSpan)
    .filter((span): span is Span => span !== null);

  const kept: WorkBlock[] = [];
  const deduped: WorkBlock[] = [];

  for (const block of chatBlocks) {
    if (block.category !== MEETING_CATEGORY) {
      // Reactive interruption blocks never collide with the calendar.
      kept.push(block);
      continue;
    }
    const span = blockSpan(block);
    const overlapsCalendar =
      span !== null &&
      meetingSpans.some((meeting) => spansOverlap(span.start, span.end, meeting.start, meeting.end));
    if (overlapsCalendar) {
      deduped.push(block);
    } else {
      kept.push(block);
    }
  }

  return { kept, deduped };
}
