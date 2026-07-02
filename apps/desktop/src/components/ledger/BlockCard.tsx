import { useState } from "react";
import { Check, Clock, GraduationCap, X } from "lucide-react";
import type { WorkBlock, WorkCategory, PlannedStatus, WorkMode } from "../../../../../packages/domain/src/models";
import { workCategories, plannedStatuses, workModes } from "../../../../../packages/domain/src/taxonomy";
import { applyLocalTime, fieldLabel, formatRange, humanizeCorrectionValue, pct, plannedStatusLabel, toLocalTimeInput } from "../../lib/format";
import type { LearnedLabelMatch } from "../../lib/learnedLabels";
import { ConfidenceChip } from "../common/ConfidenceChip";
import { EvidenceDetails } from "../common/EvidenceDetails";

// Provenance label derived from the `work_block_id` prefix — the same convention
// `App.tsx` keys cross-source dedup off of (`calendar-outlook-` = calendar, `imported-`
// = generic source import). Workplace chat is the only `imported-` source surfaced in
// the UI today; if a future non-chat `imported-` source lands, refine the label off
// `derived_from`/`evidence` rather than assuming chat here.
function blockOrigin(workBlockId: string): { label: string; title: string } {
  if (workBlockId.startsWith("calendar-outlook-")) {
    return { label: "Calendar", title: "Imported from your Outlook calendar" };
  }
  if (workBlockId.startsWith("imported-")) {
    return { label: "Workplace chat", title: "Derived from imported workplace-chat activity" };
  }
  return { label: "Activity capture", title: "Captured from your foreground-app activity" };
}

export function BlockCard({
  block,
  onConfirm,
  onExclude,
  onRelabel,
  learnedLabels = []
}: {
  block: WorkBlock;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: (blockId: string, field: keyof WorkBlock, value: WorkBlock[keyof WorkBlock]) => void;
  learnedLabels?: LearnedLabelMatch[];
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [timeError, setTimeError] = useState(false);
  const origin = blockOrigin(block.work_block_id);

  function handleStartTimeEdit() {
    setDraftStart(toLocalTimeInput(block.start_time));
    setDraftEnd(toLocalTimeInput(block.end_time));
    setTimeError(false);
    setEditingTime(true);
  }

  function handleSaveTime() {
    if (!draftStart || !draftEnd) {
      setTimeError(true);
      return;
    }
    const [sh, sm] = draftStart.split(":").map(Number);
    const [eh, em] = draftEnd.split(":").map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      setTimeError(true);
      return;
    }
    onRelabel(block.work_block_id, "start_time", applyLocalTime(block.start_time, draftStart));
    onRelabel(block.work_block_id, "end_time", applyLocalTime(block.end_time, draftEnd));
    setEditingTime(false);
  }

  return (
    <article className={block.user_verified ? "block-card verified" : "block-card"}>
      <div className="block-topline">
        <div className="block-time">
          {editingTime ? (
            <div
              className={`time-range-editor${timeError ? " time-range-editor--error" : ""}`}
              aria-label="Time range editor"
              onKeyDown={(e) => { if (e.key === "Escape") setEditingTime(false); }}
            >
              <input
                type="time"
                value={draftStart}
                aria-label="Start time"
                autoFocus
                onChange={(e) => { setDraftStart(e.target.value); setTimeError(false); }}
              />
              <span aria-hidden="true">–</span>
              <input
                type="time"
                value={draftEnd}
                aria-label="End time"
                onChange={(e) => { setDraftEnd(e.target.value); setTimeError(false); }}
              />
              <button
                type="button"
                className="time-edit-btn"
                title={timeError ? "End must be after start" : "Save time"}
                aria-label={`Save time changes — ${block.project_name}`}
                onClick={handleSaveTime}
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                className="time-edit-btn"
                title="Cancel"
                aria-label={`Cancel time edit — ${block.project_name}`}
                onClick={() => setEditingTime(false)}
              >
                <X size={13} />
              </button>
              {timeError && (
                <span role="alert" className="sr-only">End time must be after start time</span>
              )}
            </div>
          ) : (
            <>
              <span>{formatRange(block)}</span>
              <button
                type="button"
                className="time-edit-btn"
                title="Edit time range"
                aria-label={`Edit block time range — ${block.project_name}`}
                onClick={handleStartTimeEdit}
              >
                <Clock size={12} />
              </button>
            </>
          )}
        </div>
        <div className="block-chips">
          <span className="block-origin" title={origin.title}>{origin.label}</span>
          {block.blocker_flag && <span className="blocker-badge">Blocker</span>}
          <ConfidenceChip value={block.confidence} />
        </div>
      </div>
      {learnedLabels.length > 0 && (
        <div
          className="block-learned-note"
          title={`Pre-applied from labels you repeatedly correct: ${learnedLabels
            .map((match) => `${fieldLabel(match.field)} → ${humanizeCorrectionValue(match.field, match.to_value)}`)
            .join(", ")}`}
        >
          <GraduationCap size={13} aria-hidden />
          <span>Learned from your edits</span>
        </div>
      )}
      <div className="block-main">
        <div>
          <h3 title={block.project_name}>{block.project_name}</h3>
          <p title={block.stakeholder_group}>{block.stakeholder_group}</p>
        </div>
        <div className="block-capacity" title="Share of this week's modeled capacity this block accounts for">
          <strong>{pct(block.estimated_capacity_pct)}</strong>
          <span className="capacity-caption">of week</span>
          <span className="sr-only">Share of this week's modeled capacity this block accounts for</span>
        </div>
      </div>
      <div className="tag-grid">
        <label className="tag-field">
          <span className="tag-field-label">Work category</span>
          <select aria-label={`Work category — ${block.project_name}`} title={block.category} value={block.category} onChange={(event) => onRelabel(block.work_block_id, "category", event.target.value as WorkCategory)}>
            {workCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="tag-field">
          <span className="tag-field-label">Planned status</span>
          <select aria-label={`Planned status — ${block.project_name}`} title={plannedStatusLabel(block.planned_status)} value={block.planned_status} onChange={(event) => onRelabel(block.work_block_id, "planned_status", event.target.value as PlannedStatus)}>
            {plannedStatuses.map((status) => (
              <option key={status} value={status}>{plannedStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label className="tag-field">
          <span className="tag-field-label">Work mode</span>
          <select aria-label={`Work mode — ${block.project_name}`} title={block.mode} value={block.mode} onChange={(event) => onRelabel(block.work_block_id, "mode", event.target.value as WorkMode)}>
            {workModes.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
      </div>
      <EvidenceDetails
        summary="Why this estimate?"
        evidence={block.evidence}
        derivedFrom={block.derived_from}
        emptyText="No inference detail recorded for this block."
      />
      <div className="block-actions">
        <button type="button" className="block-confirm" aria-label={`Confirm — ${block.project_name}`} onClick={() => onConfirm(block.work_block_id)}>
          <Check size={16} />
          <span>Confirm</span>
        </button>
        <button type="button" className="block-exclude" aria-label={`Exclude — ${block.project_name}`} onClick={() => onExclude(block.work_block_id)}>
          <X size={16} />
          <span>Exclude</span>
        </button>
      </div>
    </article>
  );
}
