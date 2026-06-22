import { RefreshCw } from "lucide-react";
import type { PersistedForecastRecord } from "../../services/localStore"; // note: may adjust
import { pct } from "../../lib/format";
import { formatAuditTime } from "../../lib/format";
import { ForecastList } from "../common/ForecastList";

export function ForecastAgentPanel({
  generatedForecast,
  nextWeekRangeLabel,
  status,
  error,
  deterministicReliableCapacity,
  onGenerate
}: {
  generatedForecast: PersistedForecastRecord | null;
  nextWeekRangeLabel: string;
  status: "idle" | "generating" | "error";
  error: string | null;
  deterministicReliableCapacity: number;
  onGenerate: () => void;
}) {
  const forecast = generatedForecast?.forecast;

  return (
    <section className="capacity-section forecast-panel">
      <div className="section-title">
        <div>
          <h2>Forecast Agent</h2>
          <span>{forecast ? `Generated ${formatAuditTime(generatedForecast.generated_at)}` : `Next week: ${nextWeekRangeLabel}`}</span>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={status === "generating"}
          onClick={onGenerate}
        >
          <RefreshCw size={16} />
          <span>{status === "generating" ? "Forecasting…" : forecast ? "Regenerate Forecast" : "Generate Forecast"}</span>
        </button>
      </div>
      {error && (
        <div className="error-row">
          <p className="forecast-error">{error}</p>
          <button type="button" className="error-retry" onClick={onGenerate}>Try again</button>
        </div>
      )}
      {status === "generating" && !forecast ? (
        <div className="forecast-skeleton">
          <div className="forecast-skeleton-grid">
            {[0, 1, 2, 3].map((i) => (
              <div className="forecast-skeleton-cell" key={i}>
                <span className="skeleton-line" style={{ height: 11, width: "55%" }} />
                <span className="skeleton-line" style={{ height: 22, width: "45%" }} />
                <span className="skeleton-line" style={{ height: 10, width: "70%" }} />
              </div>
            ))}
          </div>
          <div className="forecast-skeleton-copy">
            <span className="skeleton-line" style={{ height: 18, width: "65%" }} />
            <span className="skeleton-line" style={{ height: 12, width: "90%" }} />
            <span className="skeleton-line" style={{ height: 12, width: "80%" }} />
          </div>
        </div>
      ) : !forecast ? (
        <div className="forecast-empty">
          <strong>No AI forecast yet.</strong>
          <span>
            The deterministic estimate is {pct(deterministicReliableCapacity)}. Generate a forecast to add assumptions,
            constraints, scenarios, and planning recommendations.
          </span>
        </div>
      ) : (
        <>
          <div className="forecast-summary">
            <div>
              <span>Reliable new-work capacity</span>
              <strong>{pct(forecast.reliable_new_work_capacity_pct)}</strong>
              <small>{Math.round(forecast.confidence * 100)}% forecast confidence</small>
            </div>
            <div>
              <span>Conservative</span>
              <strong>{pct(forecast.conservative_capacity_pct)}</strong>
              <small>protected planning case</small>
            </div>
            <div>
              <span>Likely</span>
              <strong>{pct(forecast.likely_capacity_pct)}</strong>
              <small>expected case</small>
            </div>
            <div>
              <span>Optimistic</span>
              <strong>{pct(forecast.optimistic_capacity_pct)}</strong>
              <small>if risks clear</small>
            </div>
          </div>
          <div className="forecast-copy">
            <h3>{forecast.headline}</h3>
            <p>{forecast.summary_text}</p>
          </div>
          <div className="forecast-grid">
            <ForecastList title="Constraints" items={forecast.key_constraints} />
            <ForecastList title="Risk flags" items={forecast.risk_flags} />
            <ForecastList title="Recommended actions" items={forecast.recommended_actions} />
            <ForecastList title="Assumptions" items={forecast.assumptions} />
          </div>
        </>
      )}
    </section>
  );
}
