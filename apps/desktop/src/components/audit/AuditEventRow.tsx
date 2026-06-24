import { useState } from "react";
import { ClipboardCopy } from "lucide-react";
import type { AuditEvent } from "../../../../../packages/domain/src/models";
import { auditTypeLabel, formatAuditTime, privacyLevelLabel, privacyLevelTooltip } from "../../lib/format";

export function AuditEventRow({ event }: { event: AuditEvent }) {
  const [copied, setCopied] = useState(false);
  const detailsJson = JSON.stringify(event.details, null, 2);

  return (
    <details className="audit-row">
      <summary>
        <div>
          <span className={`audit-badge ${event.type}`}>{auditTypeLabel(event.type)}</span>
          <time>{formatAuditTime(event.timestamp)}</time>
        </div>
        <div>
          <strong>{event.title}</strong>
          <small>{event.summary}</small>
        </div>
        <span
          className={`audit-privacy audit-privacy--${event.privacy_level}`}
          title={privacyLevelTooltip(event.privacy_level)}
        >
          {privacyLevelLabel(event.privacy_level)}
        </span>
      </summary>
      <div className="audit-detail">
        <div className="audit-detail-header">
          <span>{event.source}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(event, null, 2));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            <ClipboardCopy size={15} />
            {copied ? "JSON Copied" : "Copy JSON"}
          </button>
        </div>
        <pre>{detailsJson}</pre>
      </div>
    </details>
  );
}
