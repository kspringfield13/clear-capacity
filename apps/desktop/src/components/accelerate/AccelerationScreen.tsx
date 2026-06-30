import { useMemo } from "react";
import { Lightbulb, Rocket, Sparkles, Upload, Wrench, Workflow, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccelerationSignal, AccelerationPlayType } from "../../../../../packages/domain/src/models";
import type { Screen } from "../../lib/types";
import { accelerationTypeLabel } from "../../lib/format";
import { EmptyState } from "../common/EmptyState";
import { EvidenceDetails } from "../common/EvidenceDetails";

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

function PlayCard({ signal }: { signal: AccelerationSignal }) {
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
      <EvidenceDetails
        summary="Why this play?"
        evidence={signal.evidence}
        derivedFrom={signal.derived_from}
        emptyText="No evidence recorded for this play."
        className="play-evidence"
      />
    </article>
  );
}

export function AccelerationScreen({
  signals,
  hasWorkBlocks,
  onOpenScreen,
}: {
  signals: AccelerationSignal[];
  hasWorkBlocks: boolean;
  onOpenScreen: (screen: Screen) => void;
}) {
  // Total reclaimable minutes across the surfaced plays — the headline "what's the prize" figure.
  const totalSaved = useMemo(
    () => signals.reduce((sum, signal) => sum + signal.estimated_minutes_saved_per_week, 0),
    [signals]
  );

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

  return (
    <section className="screen acceleration-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Acceleration</p>
          <h1>Ways to reclaim your week.</h1>
          <p className="screen-subhead">
            Mined locally from your observed work — no AI, no network. {signals.length}{" "}
            {signals.length === 1 ? "play" : "plays"} could reclaim roughly{" "}
            <strong>{totalSaved} min/week</strong>. Each cites the evidence it was derived from; review
            before you act.
          </p>
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
      <div className="play-grid">
        {signals.map((signal) => (
          <PlayCard key={signal.signal_id} signal={signal} />
        ))}
      </div>
    </section>
  );
}
