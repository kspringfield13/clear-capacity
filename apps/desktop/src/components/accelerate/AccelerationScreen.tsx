import { useMemo } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Lightbulb,
  Rocket,
  RotateCcw,
  Settings,
  Sparkles,
  Upload,
  Wrench,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccelerationPlay, AccelerationSignal, AccelerationPlayType } from "../../../../../packages/domain/src/models";
import type { Screen } from "../../lib/types";
import { accelerationTypeLabel, formatAuditTime } from "../../lib/format";
import { EmptyState } from "../common/EmptyState";
import { EvidenceDetails } from "../common/EvidenceDetails";
import { InlineError } from "../common/InlineError";

const TYPE_ICONS: Record<AccelerationPlayType, LucideIcon> = {
  automate: Workflow,
  tool: Wrench,
  technique: Lightbulb,
};

// Plain-language gloss for each play type, used as the chip tooltip and an
// explanation-only screen-reader mirror (the chip text alone reads as a bare enum).
const TYPE_TOOLTIPS: Record<AccelerationPlayType, string> = {
  automate: "A repetitive workflow that a reusable automation or AI skill could take over",
  tool: "A recurring time-sink where an off-the-shelf tool or template would help",
  technique: "A working-habit change that cuts an observed friction or context-switch cost",
};

function PlayCard({
  signal,
  isSaved,
  onSave,
  onUnsave,
  onDismiss,
}: {
  signal: AccelerationPlay;
  isSaved: boolean;
  onSave: (signal: AccelerationSignal) => void;
  onUnsave: (signalId: string) => void;
  onDismiss: (signal: AccelerationSignal) => void;
}) {
  const Icon = TYPE_ICONS[signal.type];
  const savedLabel = `~${signal.estimated_minutes_saved_per_week} min`;
  const confidencePct = Math.round(signal.confidence * 100);

  return (
    <article className="play-card">
      <div className="play-header">
        <span className={`play-type-chip ${signal.type}`} title={TYPE_TOOLTIPS[signal.type]}>
          <Icon size={13} aria-hidden />
          <span>{accelerationTypeLabel(signal.type)}</span>
          <span className="sr-only">. {TYPE_TOOLTIPS[signal.type]}</span>
        </span>
        <span
          className="play-confidence"
          title="How confident the deterministic miner is in this signal, from the strength and recurrence of the evidence"
        >
          {confidencePct}% confidence
          <span className="sr-only">
            {" "}
            — how confident the deterministic miner is, based on the strength and recurrence of the evidence
          </span>
        </span>
      </div>
      <h3 className="play-title">{signal.title}</h3>
      <p className="play-detail">{signal.detail}</p>
      <div
        className="play-saving"
        title="Estimated time this could reclaim each week — a conservative planning aid, reviewable below, not a guarantee"
      >
        <Zap size={14} aria-hidden className="play-saving-icon" />
        <strong>{savedLabel}</strong>
        <span>est. saved / week</span>
        <span className="sr-only">
          {" "}
          — estimated time this could reclaim each week, a conservative planning aid you can review below, not a guarantee
        </span>
      </div>
      {signal.recommended_tools.length > 0 && (
        <div className="play-tools">
          <span className="play-tools-label">Recommended tools</span>
          <ul className="play-tool-chips">
            {signal.recommended_tools.map((tool) => (
              <li key={tool} className="play-tool-chip">
                {tool}
              </li>
            ))}
          </ul>
        </div>
      )}
      {signal.recipe && (
        <details className="play-recipe">
          <summary>Skill recipe</summary>
          <div className="play-recipe-body">{signal.recipe}</div>
        </details>
      )}
      <EvidenceDetails
        summary="Why this play?"
        evidence={signal.evidence}
        derivedFrom={signal.derived_from}
        emptyText="No evidence recorded for this play."
        className="play-evidence"
      />
      <div className="play-actions">
        <button
          type="button"
          className={`play-action play-action-save${isSaved ? " is-saved" : ""}`}
          aria-pressed={isSaved}
          title={isSaved ? "Saved — select again to remove from your saved plays" : "Save this play to revisit later"}
          onClick={() => (isSaved ? onUnsave(signal.signal_id) : onSave(signal))}
        >
          {isSaved ? <BookmarkCheck size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
          <span>{isSaved ? "Saved" : "Save"}</span>
        </button>
        <button
          type="button"
          className="play-action play-action-dismiss"
          title="Dismiss this play — hide it from your acceleration list"
          onClick={() => onDismiss(signal)}
        >
          <X size={14} aria-hidden />
          <span>Dismiss</span>
        </button>
      </div>
    </article>
  );
}

export function AccelerationScreen({
  signals,
  dismissedPlayIds,
  savedPlayIds,
  onDismissPlay,
  onSavePlay,
  onUnsavePlay,
  onRestoreDismissedPlays,
  hasWorkBlocks,
  onOpenScreen,
  generateStatus,
  generateError,
  onGenerateSkills,
  aiConfigured,
  generatedAt,
  hasAuthoredPlays,
}: {
  signals: AccelerationPlay[];
  dismissedPlayIds: string[];
  savedPlayIds: string[];
  onDismissPlay: (signal: AccelerationSignal) => void;
  onSavePlay: (signal: AccelerationSignal) => void;
  onUnsavePlay: (signalId: string) => void;
  onRestoreDismissedPlays: () => void;
  hasWorkBlocks: boolean;
  onOpenScreen: (screen: Screen) => void;
  generateStatus: "idle" | "generating" | "error";
  generateError: string | null;
  onGenerateSkills: () => void;
  aiConfigured: boolean;
  generatedAt: string | null;
  hasAuthoredPlays: boolean;
}) {
  const dismissed = useMemo(() => new Set(dismissedPlayIds), [dismissedPlayIds]);
  const saved = useMemo(() => new Set(savedPlayIds), [savedPlayIds]);
  // Hide dismissed plays. Dismiss is keyed by the deterministic `signal_id`, so a hidden
  // play stays hidden as the miner re-derives — until the user restores it.
  const visibleSignals = useMemo(
    () => signals.filter((signal) => !dismissed.has(signal.signal_id)),
    [signals, dismissed]
  );
  // Only counts dismissed ids that still map to a currently-mined play (so "Restore N"
  // reflects what would actually reappear).
  const dismissedCount = signals.length - visibleSignals.length;
  // Total reclaimable minutes across the surfaced plays — the headline "what's the prize" figure.
  const totalSaved = useMemo(
    () => visibleSignals.reduce((sum, signal) => sum + signal.estimated_minutes_saved_per_week, 0),
    [visibleSignals]
  );

  // No plays mined at all (nothing recurred enough, or no reviewed work yet).
  if (signals.length === 0) {
    return (
      <section className="screen acceleration-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Acceleration</p>
            <h1>No acceleration plays yet.</h1>
          </div>
        </div>
        <EmptyState
          icon={Rocket}
          title="Nothing to accelerate yet."
          description={
            hasWorkBlocks
              ? "The Acceleration engine mines your reviewed work for repetitive workflows, tool-able time-sinks, and context-switch hotspots. None have recurred enough to surface yet — keep reviewing this week's blocks and they'll appear here automatically."
              : "The Acceleration engine mines your reviewed work for repetitive workflows, tool-able time-sinks, and context-switch hotspots. Import Outlook events or classify active-window sessions first, then revisit this screen."
          }
        >
          <button className="primary-action" type="button" onClick={() => onOpenScreen("setup")}>
            <Upload size={16} />
            <span>Import calendar</span>
          </button>
          <button className="secondary-action" type="button" onClick={() => onOpenScreen("daily")}>
            <span>Review today</span>
          </button>
        </EmptyState>
      </section>
    );
  }

  // Plays exist but the user dismissed them all — offer a way back rather than implying
  // none were ever found.
  if (visibleSignals.length === 0) {
    return (
      <section className="screen acceleration-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Acceleration</p>
            <h1>All plays dismissed.</h1>
          </div>
        </div>
        <EmptyState
          icon={Rocket}
          title="You've dismissed every play."
          description={`${dismissedCount} acceleration ${dismissedCount === 1 ? "play is" : "plays are"} hidden. Restore them to take another look, or keep reviewing your work for new ones.`}
        >
          <button className="primary-action" type="button" onClick={onRestoreDismissedPlays}>
            <RotateCcw size={16} />
            <span>Restore dismissed plays</span>
          </button>
          <button className="secondary-action" type="button" onClick={() => onOpenScreen("daily")}>
            <span>Review today</span>
          </button>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="screen acceleration-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Acceleration</p>
          <h1>Ways to reclaim your week.</h1>
          <p className="screen-subhead">
            Mined locally from your observed work — no AI, no network. {visibleSignals.length}{" "}
            {visibleSignals.length === 1 ? "play" : "plays"} could reclaim roughly{" "}
            <strong>{totalSaved} min/week</strong>. Each cites the evidence it was derived from; review
            before you act.
          </p>
          {dismissedCount > 0 && (
            <button type="button" className="acceleration-restore" onClick={onRestoreDismissedPlays}>
              <RotateCcw size={13} aria-hidden />
              <span>
                Restore {dismissedCount} dismissed {dismissedCount === 1 ? "play" : "plays"}
              </span>
            </button>
          )}
        </div>
        <div className="acceleration-total" title="Combined estimated time the plays below could reclaim each week">
          <Sparkles size={16} aria-hidden />
          <div>
            <strong>~{totalSaved} min</strong>
            <small>est. saved / week</small>
          </div>
          <span className="sr-only">
            Combined estimated time the plays below could reclaim each week
          </span>
        </div>
      </div>
      <div className="acceleration-synth">
        {aiConfigured ? (
          <>
            <button
              type="button"
              className="primary-action"
              disabled={generateStatus === "generating"}
              onClick={onGenerateSkills}
              title="Send the derived signals above (app-name flows and counts only — never window titles) to your configured AI to author step-by-step skill recipes and tool picks"
            >
              <Sparkles size={16} aria-hidden />
              <span>
                {generateStatus === "generating"
                  ? "Authoring skills…"
                  : hasAuthoredPlays
                    ? "Regenerate skills"
                    : "Generate skills"}
              </span>
            </button>
            <p className="acceleration-synth-note">
              {generatedAt
                ? `AI skills generated ${formatAuditTime(generatedAt)}. Only derived signals are sent — never raw window titles.`
                : "Optional: author runnable skill recipes and tool picks from the plays above. Only derived signals are sent — never raw window titles."}
            </p>
          </>
        ) : (
          <div className="acceleration-synth-hint">
            <p>
              Add an AI key in Settings to author runnable skill recipes and tool picks from these
              plays. The plays above are always available without AI.
            </p>
            <button type="button" className="secondary-action" onClick={() => onOpenScreen("setup")}>
              <Settings size={16} aria-hidden />
              <span>Open Settings</span>
            </button>
          </div>
        )}
      </div>
      {generateError && <InlineError message={generateError} onRetry={onGenerateSkills} />}
      <div className="play-grid">
        {visibleSignals.map((signal) => (
          <PlayCard
            key={signal.signal_id}
            signal={signal}
            isSaved={saved.has(signal.signal_id)}
            onSave={onSavePlay}
            onUnsave={onUnsavePlay}
            onDismiss={onDismissPlay}
          />
        ))}
      </div>
    </section>
  );
}
