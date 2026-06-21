import { useState } from "react";
import { Search } from "lucide-react";
import type { AuditEvent } from "../../../../../packages/domain/src/models";
import { auditTypeLabel } from "../../lib/format";
import { formatAuditTime } from "../../lib/format";
import { AuditEventRow } from "./AuditEventRow";

export function AuditLogScreen({ auditEvents }: { auditEvents: AuditEvent[] }) {
  type AuditFilter = "all" | "capture" | "session" | "visual" | "calendar" | "correction" | "classifier" | "copilot" | "forecast" | "narrative" | "privacy";
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [query, setQuery] = useState("");
  const filters: Array<{ id: AuditFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "capture", label: "Capture" },
    { id: "session", label: "Session" },
    { id: "visual", label: "Visual" },
    { id: "calendar", label: "Calendar" },
    { id: "correction", label: "Correction" },
    { id: "classifier", label: "Classifier" },
    { id: "copilot", label: "Copilot" },
    { id: "forecast", label: "Forecast" },
    { id: "narrative", label: "Narrative" },
    { id: "privacy", label: "Privacy" }
  ];
  const filterMatches: Record<AuditFilter, (event: AuditEvent) => boolean> = {
    all: () => true,
    capture: (event) => event.type === "active_window_sample",
    session: (event) => event.type === "activity_session",
    visual: (event) => event.type === "visual_context",
    calendar: (event) => event.type === "calendar_import",
    correction: (event) => event.type === "user_correction",
    classifier: (event) => event.type === "work_block_classification",
    copilot: (event) => event.type === "review_copilot",
    forecast: (event) => event.type === "forecast_agent",
    narrative: (event) => event.type === "narrative_generation",
    privacy: (event) => event.type === "privacy_pause" || event.type === "privacy_resume"
  };
  const filteredEvents = auditEvents
    .filter((event) => filterMatches[filter](event))
    .filter((event) => {
      const haystack = `${event.title} ${event.summary} ${event.source} ${JSON.stringify(event.details)}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  return (
    <section className="screen audit-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Audit log</p>
          <h1>Every local signal, inference, correction, and privacy event.</h1>
        </div>
        <div className="summary-score">
          <span>Local events</span>
          <strong>{auditEvents.length}</strong>
        </div>
      </div>

      <div className="audit-toolbar">
        <div className="audit-filters">
          {filters.map((item) => (
            <button
              className={filter === item.id ? "is-active" : ""}
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search audit log"
            placeholder="Search audit events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="audit-list">
        {filteredEvents.length === 0 ? (
          <section className="audit-empty">
            <strong>No audit events match.</strong>
            <span>Capture samples, imports, corrections, and privacy changes will appear here.</span>
          </section>
        ) : (
          filteredEvents.map((event) => <AuditEventRow event={event} key={event.event_id} />)
        )}
      </div>
    </section>
  );
}
