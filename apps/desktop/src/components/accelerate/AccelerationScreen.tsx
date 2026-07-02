import { useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  CircleCheck,
  Copy,
  Library,
  Lightbulb,
  Repeat,
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
import type { RealizedSavingsEntry, RealizedSavingsSummary } from "../../../../../packages/inference/src/accelerate";
import type { Screen } from "../../lib/types";
import { accelerationTypeLabel, formatAuditTime } from "../../lib/format";
import type { PushToast } from "../../hooks/useToasts";
import { EmptyState } from "../common/EmptyState";
import { EvidenceDetails } from "../common/EvidenceDetails";
import { InlineError } from "../common/InlineError";
import { AccelerationTrackRecord } from "./AccelerationTrackRecord";

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
  isInLibrary,
  isActedOn,
  onSave,
  onUnsave,
  onSaveSkill,
  onRemoveSkill,
  onMarkActedOn,
  onUnmarkActedOn,
  onDismiss,
  pushToast,
}: {
  signal: AccelerationPlay;
  isSaved: boolean;
  isInLibrary: boolean;
  isActedOn: boolean;
  onSave: (signal: AccelerationSignal) => void;
  onUnsave: (signalId: string) => void;
  onSaveSkill: (play: AccelerationPlay) => void;
  onRemoveSkill: (signalId: string) => void;
  onMarkActedOn: (signal: AccelerationSignal) => void;
  onUnmarkActedOn: (signalId: string) => void;
  onDismiss: (signal: AccelerationSignal) => void;
  pushToast: PushToast;
}) {
  const Icon = TYPE_ICONS[signal.type];
  const savedLabel = `~${signal.estimated_minutes_saved_per_week} min`;
  const confidencePct = Math.round(signal.confidence * 100);
  const recurrenceWeeks = signal.recurrence_weeks ?? 0;
  const [recipeCopied, setRecipeCopied] = useState(false);

  async function copyRecipe() {
    if (!signal.recipe) return;
    try {
      // Non-optional so a missing clipboard (insecure webview) throws into the catch
      // rather than silently no-op'ing while we falsely announce success.
      await navigator.clipboard.writeText(signal.recipe);
      setRecipeCopied(true);
      window.setTimeout(() => setRecipeCopied(false), 1200);
      pushToast({ tone: "success", message: "Recipe copied to clipboard" });
    } catch {
      pushToast({ tone: "error", message: "Couldn't copy to the clipboard" });
    }
  }

  return (
    <article className="play-card">
      <div className="play-header">
        <div className="play-header-tags">
          <span className={`play-type-chip ${signal.type}`} title={TYPE_TOOLTIPS[signal.type]}>
            <Icon size={13} aria-hidden />
            <span>{accelerationTypeLabel(signal.type)}</span>
            <span className="sr-only">. {TYPE_TOOLTIPS[signal.type]}</span>
          </span>
          {signal.authored && (
            <span
              className="play-ai-badge"
              title="Your configured AI wrote this play's description, recipe, and tool picks. The reclaimable estimate, confidence, and cited evidence stay derived from your observed work."
            >
              <Sparkles size={12} aria-hidden />
              <span>AI-authored</span>
              <span className="sr-only">
                . The description, recipe, and tool picks were written by your configured AI; the
                reclaimable estimate, confidence, and cited evidence stay derived from your observed
                work.
              </span>
            </span>
          )}
          {recurrenceWeeks > 0 && (
            <span
              className="play-recurring-badge"
              title={`This signal has also surfaced in ${recurrenceWeeks} earlier ${recurrenceWeeks === 1 ? "week" : "weeks"} — a persistent pattern, so it's ranked a little higher.`}
            >
              <Repeat size={12} aria-hidden />
              <span>
                Recurring {recurrenceWeeks} {recurrenceWeeks === 1 ? "week" : "weeks"}
              </span>
              <span className="sr-only">
                . This signal has also surfaced in {recurrenceWeeks} earlier{" "}
                {recurrenceWeeks === 1 ? "week" : "weeks"}, a persistent pattern, so it's ranked a
                little higher.
              </span>
            </span>
          )}
        </div>
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
          <div className="play-recipe-actions">
            <button
              type="button"
              className="play-recipe-action"
              title={recipeCopied ? "Copied" : "Copy this recipe to the clipboard"}
              aria-label={recipeCopied ? "Recipe copied to clipboard" : "Copy this recipe to the clipboard"}
              onClick={() => void copyRecipe()}
            >
              {recipeCopied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              <span>{recipeCopied ? "Copied" : "Copy"}</span>
            </button>
            <button
              type="button"
              className={`play-recipe-action${isInLibrary ? " is-saved" : ""}`}
              aria-pressed={isInLibrary}
              title={
                isInLibrary
                  ? "Saved to your skills library — select again to remove"
                  : "Save this recipe to your skills library so it survives regeneration"
              }
              onClick={() => (isInLibrary ? onRemoveSkill(signal.signal_id) : onSaveSkill(signal))}
            >
              <Library size={13} aria-hidden />
              <span>{isInLibrary ? "In library" : "Save to library"}</span>
            </button>
          </div>
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
          className={`play-action play-action-acted${isActedOn ? " is-acted" : ""}`}
          aria-pressed={isActedOn}
          title={
            isActedOn
              ? "You marked this play as acted on — select again to undo"
              : "Mark this play as acted on so its impact can be tracked over time"
          }
          onClick={() => (isActedOn ? onUnmarkActedOn(signal.signal_id) : onMarkActedOn(signal))}
        >
          {isActedOn ? <CheckCircle2 size={14} aria-hidden /> : <CircleCheck size={14} aria-hidden />}
          <span>{isActedOn ? "Acted on" : "I acted on this"}</span>
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
  realizedSavings,
  realizedSavingsSummary,
  dismissedPlayIds,
  savedPlayIds,
  actedOnPlayIds,
  savedSkillIds,
  onDismissPlay,
  onSavePlay,
  onUnsavePlay,
  onMarkPlayActedOn,
  onUnmarkPlayActedOn,
  onSaveSkill,
  onRemoveSkill,
  onRestoreDismissedPlays,
  hasWorkBlocks,
  savedSkillCount,
  onOpenScreen,
  generateStatus,
  generateError,
  onGenerateSkills,
  aiConfigured,
  generatedAt,
  hasAuthoredPlays,
  pushToast,
}: {
  signals: AccelerationPlay[];
  realizedSavings: RealizedSavingsEntry[];
  realizedSavingsSummary: RealizedSavingsSummary | null;
  dismissedPlayIds: string[];
  savedPlayIds: string[];
  actedOnPlayIds: string[];
  savedSkillIds: string[];
  onDismissPlay: (signal: AccelerationSignal) => void;
  onSavePlay: (signal: AccelerationSignal) => void;
  onUnsavePlay: (signalId: string) => void;
  onMarkPlayActedOn: (signal: AccelerationSignal) => void;
  onUnmarkPlayActedOn: (signalId: string) => void;
  onSaveSkill: (play: AccelerationPlay) => void;
  onRemoveSkill: (signalId: string) => void;
  onRestoreDismissedPlays: () => void;
  hasWorkBlocks: boolean;
  savedSkillCount: number;
  onOpenScreen: (screen: Screen) => void;
  generateStatus: "idle" | "generating" | "error";
  generateError: string | null;
  onGenerateSkills: () => void;
  aiConfigured: boolean;
  generatedAt: string | null;
  hasAuthoredPlays: boolean;
  pushToast: PushToast;
}) {
  const dismissed = useMemo(() => new Set(dismissedPlayIds), [dismissedPlayIds]);
  const saved = useMemo(() => new Set(savedPlayIds), [savedPlayIds]);
  const actedOn = useMemo(() => new Set(actedOnPlayIds), [actedOnPlayIds]);
  const inLibrary = useMemo(() => new Set(savedSkillIds), [savedSkillIds]);
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
  // Name still-mined plays in the realized-savings track record; entries for retired signals fall
  // back to their type label (the persisted history stores no title — id/type/minutes only).
  const titleBySignalId = useMemo(
    () => new Map(signals.map((signal) => [signal.signal_id, signal.title])),
    [signals]
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
        <AccelerationTrackRecord
          entries={realizedSavings}
          summary={realizedSavingsSummary}
          titleBySignalId={titleBySignalId}
        />
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
        <AccelerationTrackRecord
          entries={realizedSavings}
          summary={realizedSavingsSummary}
          titleBySignalId={titleBySignalId}
        />
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
            {visibleSignals.length === 1 ? "play" : "plays"}, each citing the evidence it was derived
            from; review before you act.
          </p>
          {dismissedCount > 0 && (
            <button type="button" className="acceleration-restore" onClick={onRestoreDismissedPlays}>
              <RotateCcw size={13} aria-hidden />
              <span>
                Restore {dismissedCount} dismissed {dismissedCount === 1 ? "play" : "plays"}
              </span>
            </button>
          )}
          {savedSkillCount > 0 && (
            <button type="button" className="acceleration-restore" onClick={() => onOpenScreen("skills")}>
              <Library size={13} aria-hidden />
              <span>
                View {savedSkillCount} saved {savedSkillCount === 1 ? "skill" : "skills"}
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
      <AccelerationTrackRecord
        entries={realizedSavings}
        summary={realizedSavingsSummary}
        titleBySignalId={titleBySignalId}
      />
      <div className="play-grid">
        {visibleSignals.map((signal) => (
          <PlayCard
            key={signal.signal_id}
            signal={signal}
            isSaved={saved.has(signal.signal_id)}
            isInLibrary={inLibrary.has(signal.signal_id)}
            isActedOn={actedOn.has(signal.signal_id)}
            onSave={onSavePlay}
            onUnsave={onUnsavePlay}
            onSaveSkill={onSaveSkill}
            onRemoveSkill={onRemoveSkill}
            onMarkActedOn={onMarkPlayActedOn}
            onUnmarkActedOn={onUnmarkPlayActedOn}
            onDismiss={onDismissPlay}
            pushToast={pushToast}
          />
        ))}
      </div>
    </section>
  );
}
