import { History, RotateCcw } from "lucide-react";
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
    .slice(0, 8);

  return (
    <section className="history-panel">
      <div className="history-title">
        <span>
          <History size={16} />
          <strong>Correction history</strong>
        </span>
        <button type="button" onClick={onResetLocalData} title="Reset local prototype data">
          <RotateCcw size={15} />
        </button>
      </div>
      {recentCorrections.length === 0 ? (
        <p>No corrections yet.</p>
      ) : (
        <ol className="history-list">
          {recentCorrections.map((correction) => {
            const block = blocks.find((candidate) => candidate.work_block_id === correction.work_block_id);
            const label = block?.project_name ?? correction.old_value;

            return (
              <li key={correction.correction_id}>
                <div>
                  <strong>{fieldLabel(correction.field)}</strong>
                  <time>{formatAuditTime(correction.timestamp)}</time>
                </div>
                <span>{label}</span>
                <small>{correction.old_value} → {correction.new_value}</small>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
