import { useState } from "react";
import { Search, PieChart, Monitor } from "lucide-react";
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
import { ActivityHeatmap } from "./ActivityHeatmap";

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
  const [searchQuery, setSearchQuery] = useState("");

  const classifiedSessionIds = new Set(blocks.flatMap((block) => block.derived_from));
  const unclassifiedSessionCount = activeWindowSessions.filter(
    (session) => !classifiedSessionIds.has(session.session_id) && session.sample_count >= 2
  ).length;

  const q = searchQuery.trim().toLowerCase();
  const visibleBlocks = q
    ? blocks.filter((b) =>
        b.project_name.toLowerCase().includes(q) ||
        (b.stakeholder_group ?? "").toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.mode.toLowerCase().includes(q)
      )
    : blocks;

  const current = blocks.length > 0
    ? blocks.reduce((latest, block) =>
        block.end_time > latest.end_time ? block : latest
      )
    : undefined;
  return (
    <section className="screen ledger-screen">
      <div className="screen-header compact">
        <div>
          <p className="eyebrow">Live work ledger</p>
          <h1>Explainable inferred work blocks.</h1>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search work blocks"
            placeholder="Search project, stakeholder, category"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
          />
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
            <PieChart size={20} />
            <div className="pulse-meter-val">
              <strong>{pct(current.estimated_capacity_pct)}</strong>
              <span className="capacity-caption">of week</span>
            </div>
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
      <ActivityHeatmap sessions={activeWindowSessions} />
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
      ) : visibleBlocks.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No blocks match."
          description={`No work blocks match "${searchQuery}". Try a different project name, stakeholder, category, or mode.`}
        >
          <button
            type="button"
            className="secondary-action"
            onClick={() => setSearchQuery("")}
          >
            Clear search
          </button>
        </EmptyState>
      ) : (
        <div className="ledger-list">
          {visibleBlocks.map((block) => (
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
