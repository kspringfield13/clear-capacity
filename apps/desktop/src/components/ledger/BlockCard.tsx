import { Check, SplitSquareHorizontal, X } from "lucide-react";
import type { WorkBlock, WorkCategory, PlannedStatus, WorkMode } from "../../../../../packages/domain/src/models";
import { workCategories, plannedStatuses, workModes } from "../../../../../packages/domain/src/taxonomy";
import { formatRange } from "../../lib/format";
import { pct } from "../../lib/format";
import { ConfidenceChip } from "../common/ConfidenceChip";

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
  return (
    <article className={block.user_verified ? "block-card verified" : "block-card"}>
      <div className="block-topline">
        <span>{formatRange(block)}</span>
        <ConfidenceChip value={block.confidence} />
      </div>
      <div className="block-main">
        <div>
          <h3>{block.project_name}</h3>
          <p>{block.stakeholder_group}</p>
        </div>
        <strong>{pct(block.estimated_capacity_pct)}</strong>
      </div>
      <div className="tag-grid">
        <select value={block.category} onChange={(event) => onRelabel(block.work_block_id, "category", event.target.value as WorkCategory)}>
          {workCategories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <select value={block.planned_status} onChange={(event) => onRelabel(block.work_block_id, "planned_status", event.target.value as PlannedStatus)}>
          {plannedStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select value={block.mode} onChange={(event) => onRelabel(block.work_block_id, "mode", event.target.value as WorkMode)}>
          {workModes.map((mode) => (
            <option key={mode}>{mode}</option>
          ))}
        </select>
      </div>
      <details className="evidence">
        <summary>Why this estimate?</summary>
        <ul>
          {block.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
      <div className="block-actions">
        <button type="button" onClick={() => onConfirm(block.work_block_id)}>
          <Check size={16} />
          <span>Confirm Block</span>
        </button>
        <button type="button">
          <SplitSquareHorizontal size={16} />
          <span>Split Block</span>
        </button>
        <button type="button" onClick={() => onExclude(block.work_block_id)}>
          <X size={16} />
          <span>Exclude Block</span>
        </button>
      </div>
    </article>
  );
}
