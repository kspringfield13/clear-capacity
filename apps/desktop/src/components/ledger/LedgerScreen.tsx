import { Search, TimerReset, Monitor } from "lucide-react";
import type {
  WorkBlock,
  ActiveWindowSample,
  ActivitySession,
  VisualContextInsight
} from "../../../../../packages/domain/src/models";
import { compactCategory } from "../../lib/format";
import { pct } from "../../lib/format";
import { BlockCard } from "./BlockCard";
import { EmptyState } from "../common/EmptyState";
import { ActivityCapturePanel } from "./ActivityCapturePanel";

export function LedgerScreen({
  blocks,
  activeWindowSamples,
  activeWindowSessions,
  visualContextInsights,
  captureError,
  classificationStatus,
  classificationError,
  visualContextStatus,
  visualContextError,
  paused,
  onClassifySessions,
  onConfirm,
  onExclude,
  onRelabel
}: {
  blocks: WorkBlock[];
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  visualContextInsights: VisualContextInsight[];
  captureError: string | null;
  classificationStatus: "idle" | "classifying" | "error";
  classificationError: string | null;
  visualContextStatus: "idle" | "capturing" | "error";
  visualContextError: string | null;
  paused: boolean;
  onClassifySessions: () => void;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: (blockId: string, field: keyof WorkBlock, value: WorkBlock[keyof WorkBlock]) => void;
}) {
  const classifiedSessionIds = new Set(blocks.flatMap((block) => block.derived_from));
  const unclassifiedSessionCount = activeWindowSessions.filter(
    (session) => !classifiedSessionIds.has(session.session_id) && session.sample_count >= 2
  ).length;
  const current = blocks[7] ?? blocks[0];
  return (
    <section className="screen ledger-screen">
      <div className="screen-header compact">
        <div>
          <p className="eyebrow">Live work ledger</p>
          <h1>Explainable inferred work blocks.</h1>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input aria-label="Search work blocks" placeholder="Search project, stakeholder, category" />
        </div>
      </div>
      {current && (
        <section className="current-block">
          <div>
            <p className="eyebrow">Current block</p>
            <h2>{current.project_name}</h2>
            <span>{compactCategory(current.category)} · {current.mode}</span>
          </div>
          <div className="pulse-meter">
            <TimerReset size={20} />
            <strong>{pct(current.estimated_capacity_pct)}</strong>
          </div>
        </section>
      )}
      <ActivityCapturePanel
        activeWindowSamples={activeWindowSamples}
        activeWindowSessions={activeWindowSessions}
        visualContextInsights={visualContextInsights}
        captureError={captureError}
        classificationStatus={classificationStatus}
        classificationError={classificationError}
        visualContextStatus={visualContextStatus}
        visualContextError={visualContextError}
        unclassifiedSessionCount={unclassifiedSessionCount}
        paused={paused}
        onClassifySessions={onClassifySessions}
      />
      {blocks.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No work blocks yet."
          description="ClearCapacity now starts empty. Import an Outlook .ics export or let active-window capture build local sessions, then use Classify sessions to draft reviewable work blocks."
        >
          {unclassifiedSessionCount > 0 && (
            <button
              type="button"
              className="primary-action"
              disabled={classificationStatus === "classifying"}
              onClick={onClassifySessions}
            >
              <span>
                {classificationStatus === "classifying"
                  ? "Classifying…"
                  : `Classify ${unclassifiedSessionCount} session${unclassifiedSessionCount === 1 ? "" : "s"}`}
              </span>
            </button>
          )}
        </EmptyState>
      ) : (
        <div className="ledger-list">
          {blocks.map((block) => (
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
