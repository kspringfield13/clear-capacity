import { Monitor, Check, ChevronRight, Play, Pause, X } from "lucide-react";
import type { ActiveWindowSample, ActivitySession, WorkBlock } from "../../../../../packages/domain/src/models";
import type { Screen } from "../../lib/types";
import { getLocalDateKey } from "../../lib/date";
import { pct } from "../../lib/format";

export function CompactWidget({
  paused,
  activeWindowSamples,
  activeWindowSessions,
  blocks,
  snapshot,
  onPauseChange,
  onOpenScreen,
  onConfirm,
  onExclude
}: {
  paused: boolean;
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  blocks: WorkBlock[];
  snapshot: any;
  onPauseChange: (paused: boolean) => void;
  onOpenScreen: (screen: Screen) => void;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
}) {
  const latestSample = activeWindowSamples[activeWindowSamples.length - 1];
  const latestSession = activeWindowSessions[0];
  const reviewQueue = blocks.filter((block) => !block.user_verified);
  const nextReview = reviewQueue[0];
  const today = getLocalDateKey();
  const observedMinutesToday = activeWindowSessions
    .filter((session) => getLocalDateKey(new Date(session.start_time)) === today)
    .reduce((total, session) => total + session.duration_minutes, 0);
  const observedHours = `${Math.floor(observedMinutesToday / 60)}h ${observedMinutesToday % 60}m`;

  return (
    <section className="quick-view">
      <header className="quick-view-header">
        <div>
          <span className={paused ? "live-dot is-paused" : "live-dot"} />
          <strong>{paused ? "Tracking paused" : "Tracking"}</strong>
        </div>
      </header>

      <section className="quick-current">
        <span>Current activity</span>
        <div>
          <Monitor size={18} />
          <div>
            <strong>{paused ? "Private mode" : latestSample?.app_name ?? "Waiting for activity"}</strong>
            <small>{paused ? "Resume when you are ready" : latestSample?.window_title ?? "No active-window sample yet"}</small>
          </div>
        </div>
        {latestSession && !paused && <p>{latestSession.duration_minutes} min in this session</p>}
      </section>

      <section className="quick-stats">
        <button type="button" onClick={() => onOpenScreen("ledger")}>
          <span>Observed today</span>
          <strong>{observedMinutesToday > 0 ? observedHours : "--"}</strong>
        </button>
        <button type="button" onClick={() => onOpenScreen("weekly")}>
          <span>Reliable capacity</span>
          <strong>{snapshot.allocated_pct > 0 ? pct(snapshot.reliable_new_work_capacity_pct) : "--"}</strong>
        </button>
      </section>

      <section className={reviewQueue.length > 0 ? "quick-review has-items" : "quick-review"}>
        <div>
          <span>Today’s review</span>
          <strong>{reviewQueue.length > 0 ? `${reviewQueue.length} item${reviewQueue.length === 1 ? "" : "s"} need attention` : "You’re all caught up"}</strong>
          <small>{nextReview ? nextReview.project_name : "New inferred work will appear here."}</small>
        </div>
        {nextReview && (
          <div className="quick-review-actions">
            <button type="button" className="quick-review-confirm" onClick={() => onConfirm(nextReview.work_block_id)}>
              <Check size={14} />
              Confirm
            </button>
            <button type="button" className="quick-review-exclude" onClick={() => onExclude(nextReview.work_block_id)}>
              <X size={14} />
              Exclude
            </button>
          </div>
        )}
      </section>

      {reviewQueue.length > 0 && (
        <button className="quick-primary" type="button" onClick={() => onOpenScreen("daily")}>
          Review {reviewQueue.length} item{reviewQueue.length === 1 ? "" : "s"}
          <ChevronRight size={17} />
        </button>
      )}

      <button className="quick-pause" type="button" onClick={() => onPauseChange(!paused)}>
        {paused ? <Play size={16} /> : <Pause size={16} />}
        {paused ? "Resume Tracking" : "Pause Tracking"}
      </button>

      <footer className="quick-footer">
        <button type="button" onClick={() => onOpenScreen("weekly")}>Open weekly summary</button>
        <button type="button" onClick={() => onOpenScreen("setup")}>Settings</button>
      </footer>
    </section>
  );
}
