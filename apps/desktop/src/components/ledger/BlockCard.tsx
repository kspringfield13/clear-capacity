import { useState } from "react";
import { Check, Clock, X } from "lucide-react";
import type { WorkBlock, WorkCategory, PlannedStatus, WorkMode } from "../../../../../packages/domain/src/models";
import { workCategories, plannedStatuses, workModes } from "../../../../../packages/domain/src/taxonomy";
import { formatRange, pct, plannedStatusLabel } from "../../lib/format";
import { ConfidenceChip } from "../common/ConfidenceChip";

function toLocalTimeInput(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function applyLocalTime(originalIso: string, hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const d = new Date(originalIso);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function BlockCard({
  block,
  onConfirm,
  onExclude,
  onRelabel
}: {
  block: WorkBlock;
  onConfirm: (blockId: string) => void;
  onExclude: (blockId: string) => void;
  onRelabel: (blockId: string, field: keyof WorkBlock, value: WorkBlock[keyof WorkBlock]) => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [timeError, setTimeError] = useState(false);

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
                aria-label="Save time changes"
                onClick={handleSaveTime}
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                className="time-edit-btn"
                title="Cancel"
                aria-label="Cancel time edit"
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
                aria-label="Edit block time range"
                onClick={handleStartTimeEdit}
              >
                <Clock size={12} />
              </button>
            </>
          )}
        </div>
        <div className="block-chips">
          {block.blocker_flag && <span className="blocker-badge">Blocker</span>}
          <ConfidenceChip value={block.confidence} />
        </div>
      </div>
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
        <select aria-label="Work category" title={block.category} value={block.category} onChange={(event) => onRelabel(block.work_block_id, "category", event.target.value as WorkCategory)}>
          {workCategories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <select aria-label="Planned status" title={plannedStatusLabel(block.planned_status)} value={block.planned_status} onChange={(event) => onRelabel(block.work_block_id, "planned_status", event.target.value as PlannedStatus)}>
          {plannedStatuses.map((status) => (
            <option key={status} value={status}>{plannedStatusLabel(status)}</option>
          ))}
        </select>
        <select aria-label="Work mode" title={block.mode} value={block.mode} onChange={(event) => onRelabel(block.work_block_id, "mode", event.target.value as WorkMode)}>
          {workModes.map((mode) => (
            <option key={mode}>{mode}</option>
          ))}
        </select>
      </div>
      <details className="evidence">
        <summary>Why this estimate?</summary>
        {block.evidence.length > 0 && (
          <ul>
            {block.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {block.derived_from.length > 0 && (
          <div className="evidence-derived">
            <p className="evidence-derived-label">Derived from</p>
            <ul className="evidence-derived-list">
              {block.derived_from.map((source) => (
                <li key={source}><code>{source}</code></li>
              ))}
            </ul>
          </div>
        )}
        {block.evidence.length === 0 && block.derived_from.length === 0 && (
          <p className="evidence-empty">No inference detail recorded for this block.</p>
        )}
      </details>
      <div className="block-actions">
        <button type="button" className="block-confirm" onClick={() => onConfirm(block.work_block_id)}>
          <Check size={16} />
          <span>Confirm</span>
        </button>
        <button type="button" className="block-exclude" onClick={() => onExclude(block.work_block_id)}>
          <X size={16} />
          <span>Exclude</span>
        </button>
      </div>
    </article>
  );
}
