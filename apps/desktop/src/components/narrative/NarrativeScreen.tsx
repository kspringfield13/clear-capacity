import { useState } from "react";
import { ClipboardCopy, Download, Pencil, RefreshCw, FileText } from "lucide-react";
import type { PersistedNarrativeRecord } from "../../services/localStore";
import { generateWeeklyNarrative } from "../../../../../packages/inference/src/capacity";
import { displaySafeNarrative, replaceIsoWeekIds } from "../../lib/date";
import { formatAuditTime } from "../../lib/format";
import { EmptyState } from "../common/EmptyState";

export function NarrativeScreen({
  narrative,
  generatedNarrative,
  weekRangeLabel,
  hasNarrativeEvidence,
  generationStatus,
  generationError,
  managerSummaryText,
  onManagerSummaryChange,
  onRegenerate
}: {
  narrative: ReturnType<typeof generateWeeklyNarrative>;
  generatedNarrative: PersistedNarrativeRecord | null;
  weekRangeLabel: string;
  hasNarrativeEvidence: boolean;
  generationStatus: "idle" | "generating" | "error";
  generationError: string | null;
  managerSummaryText: string | null;
  onManagerSummaryChange: (value: string) => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const displayNarrative = displaySafeNarrative(generatedNarrative?.narrative ?? narrative, weekRangeLabel);
  const generatedManagerText = `${displayNarrative.headline}\n\n${displayNarrative.manager_ready_summary}`;
  const managerText = replaceIsoWeekIds(managerSummaryText ?? generatedManagerText, weekRangeLabel);

  const firstBreak = managerText.indexOf('\n\n');
  const markdownContent = firstBreak > -1
    ? `# Capacity Narrative — ${weekRangeLabel}\n\n## ${managerText.slice(0, firstBreak).trim()}\n\n${managerText.slice(firstBreak + 2).trim()}`
    : `# Capacity Narrative — ${weekRangeLabel}\n\n${managerText.trim()}`;

  function handleDownload() {
    const header = `Capacity Narrative — ${weekRangeLabel}\n${"─".repeat(48)}\n\n`;
    const slug = weekRangeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const blob = new Blob([header + managerText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capacity-narrative-${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!hasNarrativeEvidence) {
    return (
      <section className="screen narrative-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly narrative</p>
            <h1>No manager summary until the week has local evidence.</h1>
          </div>
        </div>
        <EmptyState
          icon={FileText}
          title="Narrative generation is waiting."
          description="ClearCapacity will generate analyst and manager-ready text after Outlook imports or active-window-derived work blocks create enough explainable workload evidence."
        />
      </section>
    );
  }

  if (!generatedNarrative) {
    return (
      <section className="screen narrative-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly narrative</p>
            <h1>{generationStatus === "generating" ? "Generating your narrative…" : "Generate an OpenAI-backed weekly narrative."}</h1>
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={generationStatus === "generating"}
            onClick={onRegenerate}
          >
            <RefreshCw size={18} />
            <span>{generationStatus === "generating" ? "Generating…" : "Generate Narrative"}</span>
          </button>
        </div>
        {generationStatus === "generating" ? (
          <div className="narrative-skeleton">
            <div className="narrative-skeleton-panel">
              <span className="skeleton-line" style={{ height: 11, width: "35%" }} />
              <span className="skeleton-line" style={{ height: 20, width: "55%" }} />
              <span className="skeleton-line" style={{ height: 12, width: "90%", marginTop: 8 }} />
              <span className="skeleton-line" style={{ height: 12, width: "80%" }} />
              <span className="skeleton-line" style={{ height: 12, width: "85%" }} />
              <span className="skeleton-line" style={{ height: 12, width: "60%" }} />
              <span className="skeleton-line" style={{ height: 11, width: "30%", marginTop: 12 }} />
              {[0, 1, 2].map((i) => (
                <span className="skeleton-line" key={i} style={{ height: 11, width: `${70 + i * 7}%` }} />
              ))}
            </div>
            <div className="narrative-skeleton-panel">
              <span className="skeleton-line" style={{ height: 11, width: "40%" }} />
              <span className="skeleton-line" style={{ height: 20, width: "65%" }} />
              <span className="skeleton-line" style={{ height: 80, width: "100%", marginTop: 8, borderRadius: 8 }} />
              <span className="skeleton-line" style={{ height: 12, width: "75%", marginTop: 4 }} />
              <span className="skeleton-line" style={{ height: 12, width: "55%" }} />
            </div>
          </div>
        ) : (
          <>
            <EmptyState
              icon={FileText}
              title="Ready to generate."
              description="The prompt will include the current ledger, daily review corrections, weekly capacity metrics, Outlook imports, and active-window session context. It is sent to OpenAI only when generation runs."
            >
              <button
                type="button"
                className="primary-action"
                onClick={onRegenerate}
              >
                <RefreshCw size={18} />
                <span>Generate Narrative</span>
              </button>
            </EmptyState>
            {generationError && (
              <div className="error-row">
                <p className="narrative-error">{generationError}</p>
                <button type="button" className="error-retry" onClick={onRegenerate}>Try again</button>
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="screen narrative-screen">
      <div className="screen-header narrative-hero">
        <div className="narrative-hero-copy">
          <p className="eyebrow">Weekly narrative</p>
          <h1>{displayNarrative.headline}</h1>
          <div className="narrative-status">
            <span>Generated {formatAuditTime(generatedNarrative.generated_at)}</span>
            <span>{generatedNarrative.model}</span>
            <span>{generatedNarrative.trigger === "auto" ? "Daily automatic run" : "Manual regeneration"}</span>
          </div>
        </div>
        <div className="narrative-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={generationStatus === "generating"}
            onClick={onRegenerate}
          >
            <RefreshCw size={17} />
            <span>{generationStatus === "generating" ? "Generating…" : "Regenerate Narrative"}</span>
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={handleDownload}
          >
            <Download size={17} />
            <span>Download .txt</span>
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(markdownContent);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            <ClipboardCopy size={18} />
            <span>{copied ? "Copied!" : "Copy as Markdown"}</span>
          </button>
        </div>
      </div>
      {generationError && (
        <div className="error-row">
          <p className="narrative-error">{generationError}</p>
          <button type="button" className="error-retry" onClick={onRegenerate}>Try again</button>
        </div>
      )}

      <div className="narrative-layout">
        <section className="narrative-panel analyst-narrative">
          <div className="narrative-panel-header">
            <div>
              <span className="narrative-panel-kicker">Internal assessment</span>
              <h2>Analyst view</h2>
            </div>
            <span className="narrative-panel-purpose">For 1:1 prep</span>
          </div>
          <div className="narrative-copy">
            <span>Weekly assessment</span>
            <p>{displayNarrative.summary_text}</p>
          </div>
          <div className="driver-heading">
            <div>
              <span>Evidence considered</span>
              <small>{displayNarrative.key_drivers.length} signals</small>
            </div>
          </div>
          <div className="driver-list">
            {displayNarrative.key_drivers.map((driver, index) => (
              <div key={driver}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>{driver}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="narrative-panel manager">
          <div className="narrative-panel-header">
            <div>
              <span className="narrative-panel-kicker">Shareable draft</span>
              <h2>Manager-ready version</h2>
            </div>
            <span className="narrative-panel-purpose">Review before sharing</span>
          </div>
          <div className="textarea-toolbar">
            <div>
              <Pencil size={15} />
              <span>Editable draft</span>
            </div>
            <small>Changes save locally</small>
          </div>
          <textarea
            aria-label="Editable manager summary"
            className="narrative-editor"
            value={managerText}
            onChange={(event) => onManagerSummaryChange(event.target.value)}
          />
          <p className="manager-editor-note">
            This version is formatted for sharing. Validate the underlying work blocks before using it for planning.
          </p>
        </section>
      </div>
    </section>
  );
}
