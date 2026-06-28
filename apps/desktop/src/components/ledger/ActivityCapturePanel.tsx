import { ChevronRight, RefreshCw } from "lucide-react";
import type {
  ActiveWindowSample,
  ActivitySession,
  VisualContextInsight
} from "../../../../../packages/domain/src/models";
import { ConfidenceChip } from "../common/ConfidenceChip";
import { InlineError } from "../common/InlineError";
import { summarizeRecentSessions } from "../../lib/blocks";

export function ActivityCapturePanel({
  activeWindowSamples,
  activeWindowSessions,
  visualContextInsights,
  captureError,
  classificationStatus,
  classificationError,
  visualContextStatus,
  visualContextError,
  unclassifiedSessionCount,
  paused,
  onClassifySessions
}: {
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  visualContextInsights: VisualContextInsight[];
  captureError: string | null;
  classificationStatus: "idle" | "classifying" | "error";
  classificationError: string | null;
  visualContextStatus: "idle" | "capturing" | "error";
  visualContextError: string | null;
  unclassifiedSessionCount: number;
  paused: boolean;
  onClassifySessions: () => void;
}) {
  const latestSample = activeWindowSamples[activeWindowSamples.length - 1];
  const latestSessionSummaries = summarizeRecentSessions(activeWindowSessions);

  return (
    <details className="activity-capture-panel">
      <summary className="section-title">
        <div className="capture-panel-summary-main">
          <ChevronRight className="capture-panel-caret" size={16} aria-hidden="true" />
          <div className="capture-panel-heading">
            <span className="capture-panel-title">Live local capture</span>
            <span className="capture-panel-subtitle">{paused ? "Paused" : "Foreground app/window metadata only"}</span>
          </div>
        </div>
        <div className="capture-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={classificationStatus === "classifying" || unclassifiedSessionCount === 0}
            onClick={(e) => { e.stopPropagation(); onClassifySessions(); }}
          >
            <RefreshCw size={16} />
            <span>{classificationStatus === "classifying" ? "Classifying…" : "Classify Sessions"}</span>
          </button>
          <ConfidenceChip value={captureError ? 0.4 : paused ? 0.72 : 0.9} />
        </div>
      </summary>
      {classificationStatus === "classifying" && (
        <p className="capture-note">
          Sending {unclassifiedSessionCount} ready session{unclassifiedSessionCount === 1 ? "" : "s"} to your AI provider…
        </p>
      )}
      {classificationError && <InlineError message={classificationError} onRetry={onClassifySessions} />}
      <div className="capture-grid">
        <div className="capture-stat">
          <span>Current app</span>
          <strong>{paused ? "Paused" : latestSample?.app_name ?? "Waiting"}</strong>
          <small>{latestSample?.window_title ?? "No active-window sample yet"}</small>
        </div>
        <div className="capture-stat">
          <span>Samples</span>
          <strong>{activeWindowSamples.length}</strong>
          <small>stored locally</small>
        </div>
        <div className="capture-stat">
          <span>Sessions</span>
          <strong>{activeWindowSessions.length}</strong>
          <small>{unclassifiedSessionCount} ready for AI classification</small>
        </div>
        <div className="capture-stat">
          <span>Visual context</span>
          <strong>{visualContextInsights.length}</strong>
          <small>derived insights, raw images deleted</small>
        </div>
      </div>
      {captureError && <p className="capture-error">{captureError}</p>}
      {visualContextStatus === "capturing" && <p className="capture-note">Visual context capture is deriving a local insight.</p>}
      {visualContextError && <p className="capture-error">{visualContextError}</p>}
      {latestSessionSummaries.length > 0 && (
        <div className="session-list">
          {latestSessionSummaries.map((session, index) => (
            <div key={`${session.app_name}-${index}`}>
              <span>{session.app_name}</span>
              <strong>{session.duration_minutes} min</strong>
              <small>
                {session.window_title ?? "Window title unavailable"}
                {session.session_count > 1 ? ` · ${session.session_count} session fragments combined` : ""}
              </small>
            </div>
          ))}
        </div>
      )}
      {visualContextInsights.length > 0 && (
        <div className="session-list">
          {visualContextInsights.slice(-3).reverse().map((insight) => (
            <div key={insight.insight_id}>
              <span>{insight.visible_tool ?? insight.app_name}</span>
              <strong>{Math.round(insight.confidence * 100)}%</strong>
              <small>{insight.activity_summary}</small>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
