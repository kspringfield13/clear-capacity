import { useMemo, useState } from "react";
import { Search, History, RotateCcw, ArrowRight } from "lucide-react";
import type { WorkBlock, UserCorrection } from "../../../../../packages/domain/src/models";
import { fieldLabel, formatAuditTime, humanizeCorrectionValue } from "../../lib/format";
import { EmptyState } from "../common/EmptyState";

export function CorrectionsScreen({
  blocks,
  corrections,
  onResetLocalData
}: {
  blocks: WorkBlock[];
  corrections: UserCorrection[];
  onResetLocalData: () => void;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return [...corrections]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .map((correction) => {
        const block = blocks.find((candidate) => candidate.work_block_id === correction.work_block_id);
        return { correction, project: block?.project_name ?? correction.old_value };
      });
  }, [corrections, blocks]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(({ correction, project }) =>
      `${fieldLabel(correction.field)} ${project} ${correction.old_value} ${correction.new_value}`
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, query]);

  return (
    <section className="screen corrections-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Correction history</p>
          <h1>Label, category, and project edits.</h1>
        </div>
        <div className="summary-score">
          <span>Corrections</span>
          <strong>{corrections.length}</strong>
        </div>
      </div>

      {corrections.length > 0 && (
        <div className="corrections-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              aria-label="Search corrections"
              placeholder="Search field, project, or value"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="corrections-reset"
            onClick={onResetLocalData}
            title="Reset local prototype data"
          >
            <RotateCcw size={15} />
            <span>Reset data</span>
          </button>
        </div>
      )}

      {corrections.length === 0 ? (
        <EmptyState
          icon={History}
          title="No corrections yet."
          description="When you edit a block's label, category, project, or planned status, the change is recorded here so you can see what you adjusted and when."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No corrections match."
          description="Try a different search term."
        >
          <button type="button" className="secondary-action" onClick={() => setQuery("")}>
            Clear search
          </button>
        </EmptyState>
      ) : (
        <ol className="history-list corrections-list">
          {filtered.map(({ correction, project }) => (
            <li key={correction.correction_id}>
              <span className="correction-field">{fieldLabel(correction.field)}</span>
              <span className="correction-project" title={project}>{project}</span>
              <span
                className="correction-change"
                title={`${humanizeCorrectionValue(correction.field, correction.old_value)} → ${humanizeCorrectionValue(correction.field, correction.new_value)}`}
              >
                <span className="correction-old">{humanizeCorrectionValue(correction.field, correction.old_value)}</span>
                <ArrowRight size={12} />
                <span className="correction-new">{humanizeCorrectionValue(correction.field, correction.new_value)}</span>
              </span>
              <time>{formatAuditTime(correction.timestamp)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
