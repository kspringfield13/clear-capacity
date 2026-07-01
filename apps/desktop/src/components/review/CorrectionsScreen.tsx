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

  // Count how often each identical (field, old→new) relabel recurs so a systematic pattern the
  // model already weighs (see `analyzeCorrections` in capacity.ts) stands out from a one-off tweak.
  // Keyed by a JSON-encoded triple — matching the inference dedup key — so values with spaces or
  // slashes can never alias, and no-op edits (old === new) are ignored.
  const repeatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const correction of corrections) {
      if (correction.old_value === correction.new_value) continue;
      const key = JSON.stringify([correction.field, correction.old_value, correction.new_value]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [corrections]);

  const rows = useMemo(() => {
    return [...corrections]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .map((correction) => {
        const block = blocks.find((candidate) => candidate.work_block_id === correction.work_block_id);
        const key = JSON.stringify([correction.field, correction.old_value, correction.new_value]);
        return { correction, project: block?.project_name ?? correction.old_value, repeatCount: repeatCounts.get(key) ?? 0 };
      });
  }, [corrections, blocks, repeatCounts]);

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
          {filtered.map(({ correction, project, repeatCount }) => (
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
              {repeatCount >= 2 && (
                <span
                  className="correction-repeat"
                  title={`You've made this exact change ${repeatCount} times — a systematic pattern the model already weighs as bias.`}
                >
                  repeated {repeatCount}×
                  <span className="sr-only"> — this exact relabel recurs across your corrections, so the model treats it as a systematic bias rather than a one-off tweak.</span>
                </span>
              )}
              <time>{formatAuditTime(correction.timestamp)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
