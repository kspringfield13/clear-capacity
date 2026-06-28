import { useMemo, useState } from "react";
import { Search, History, RotateCcw, ArrowRight, Download } from "lucide-react";
import type { AuditEvent, WorkBlock, UserCorrection } from "../../../../../packages/domain/src/models";
import { fieldLabel, formatAuditTime, humanizeCorrectionValue } from "../../lib/format";
import {
  downloadTextFile,
  exportFilename,
  exportMimeType,
  serializeAuditTrail,
  serializeWorkLedger
} from "../../lib/dataExport";
import { EmptyState } from "../common/EmptyState";
import { ConfirmDialog } from "../common/ConfirmDialog";

export function CorrectionsScreen({
  blocks,
  corrections,
  auditEvents,
  onResetLocalData
}: {
  blocks: WorkBlock[];
  corrections: UserCorrection[];
  auditEvents: AuditEvent[];
  onResetLocalData: () => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Nudge: let the user save their work ledger + audit trail locally before the
  // irreversible wipe. The dialog stays open after exporting so they can review
  // the download and then confirm (or cancel).
  const exportBeforeReset = () => {
    downloadTextFile(
      exportFilename("work-ledger", "json"),
      serializeWorkLedger(blocks, "json"),
      exportMimeType("json")
    );
    downloadTextFile(
      exportFilename("audit-trail", "json"),
      serializeAuditTrail(auditEvents, "json"),
      exportMimeType("json")
    );
  };

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
              onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
            />
          </div>
          <button
            type="button"
            className="corrections-reset"
            onClick={() => setConfirmingReset(true)}
            title="Reset local prototype data"
          >
            <RotateCcw size={15} />
            <span>Reset data</span>
          </button>
        </div>
      )}

      {confirmingReset && (
        <ConfirmDialog
          title="Reset all local data?"
          description="This permanently clears everything ClearCapacity has stored on this device. It can't be undone."
          confirmLabel="Reset everything"
          onConfirm={() => {
            setConfirmingReset(false);
            onResetLocalData();
          }}
          onCancel={() => setConfirmingReset(false)}
        >
          <ul className="dialog-delete-list">
            <li>{blocks.length} work {blocks.length === 1 ? "block" : "blocks"} &amp; activity samples</li>
            <li>{corrections.length} {corrections.length === 1 ? "correction" : "corrections"}</li>
            <li>The audit trail, forecasts &amp; weekly history</li>
            <li>Calendar imports &amp; retention settings</li>
          </ul>
          <button
            type="button"
            className="secondary-action dialog-export-action"
            onClick={exportBeforeReset}
          >
            <Download size={15} />
            <span>Export my data first</span>
          </button>
        </ConfirmDialog>
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
