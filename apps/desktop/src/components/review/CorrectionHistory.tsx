import { History, RotateCcw, ArrowRight } from "lucide-react";
import type { WorkBlock, UserCorrection } from "../../../../../packages/domain/src/models";
import { fieldLabel } from "../../lib/format";
import { formatAuditTime } from "../../lib/format";

export function CorrectionHistory({
  blocks,
  corrections,
  onResetLocalData
}: {
  blocks: WorkBlock[];
  corrections: UserCorrection[];
  onResetLocalData: () => void;
}) {
  const recentCorrections = [...corrections]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 12);

  return (
    <section className="history-panel">
      <div className="history-title">
        <span>
          <History size={15} />
          <strong>Correction history</strong>
          {corrections.length > 0 && <span className="history-count">{corrections.length}</span>}
        </span>
        <button type="button" onClick={onResetLocalData} title="Reset local prototype data">
          <RotateCcw size={14} />
        </button>
      </div>
      {recentCorrections.length === 0 ? (
        <p className="history-empty">
          No corrections yet. Edit a block&apos;s label, category, or project to create an entry.
        </p>
      ) : (
        <ol className="history-list">
          {recentCorrections.map((correction) => {
            const block = blocks.find((candidate) => candidate.work_block_id === correction.work_block_id);
            const label = block?.project_name ?? correction.old_value;

            return (
              <li key={correction.correction_id}>
                <span className="correction-field">{fieldLabel(correction.field)}</span>
                <span className="correction-project" title={label}>{label}</span>
                <span className="correction-change" title={`${correction.old_value} → ${correction.new_value}`}>
                  <span className="correction-old">{correction.old_value}</span>
                  <ArrowRight size={12} />
                  <span className="correction-new">{correction.new_value}</span>
                </span>
                <time>{formatAuditTime(correction.timestamp)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
