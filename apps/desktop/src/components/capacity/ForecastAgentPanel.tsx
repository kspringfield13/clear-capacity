import { RefreshCw, Target, TrendingUp } from "lucide-react";
import type { ForecastAccuracyReview, PersistedForecastRecord } from "../../services/localStore"; // note: may adjust
import { pct } from "../../lib/format";
import { formatAuditTime } from "../../lib/format";
import { ForecastList } from "../common/ForecastList";
import { EmptyState } from "../common/EmptyState";

const ACCURACY_RATING_LABEL: Record<ForecastAccuracyReview["rating"], string> = {
  on_target: "On target",
  close: "Close",
  off: "Off",
};

function scenarioLikelyPct(conservative: number, likely: number, optimistic: number): number {
  const spread = optimistic - conservative;
  return spread > 0
    ? Math.min(100, Math.max(0, ((likely - conservative) / spread) * 100))
    : 50;
}

export function ForecastAgentPanel({
  generatedForecast,
  forecastAccuracy,
  nextWeekRangeLabel,
  status,
  error,
  deterministicReliableCapacity,
  onGenerate
}: {
  generatedForecast: PersistedForecastRecord | null;
  forecastAccuracy: ForecastAccuracyReview | null;
  nextWeekRangeLabel: string;
  status: "idle" | "generating" | "error";
  error: string | null;
  deterministicReliableCapacity: number;
  onGenerate: () => void;
}) {
  const forecast = generatedForecast?.forecast;
  const likelyPct = forecast
    ? scenarioLikelyPct(
        forecast.conservative_capacity_pct,
        forecast.likely_capacity_pct,
        forecast.optimistic_capacity_pct
      )
    : 50;

  const likelyLeft = forecast
    ? Math.round(
        ((forecast.likely_capacity_pct - forecast.conservative_capacity_pct) /
          Math.max(1, forecast.optimistic_capacity_pct - forecast.conservative_capacity_pct)) *
          100
      )
    : 0;

  // Hide the absolutely-positioned center "Likely" label when it sits close to
  // either end, where it would collide with the Conservative/Optimistic labels.
  // The likely value still reads from the summary card above and the range aria-label.
  const showLikelyLabel = likelyLeft >= 12 && likelyLeft <= 88;

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
      {forecastAccuracy && (
        <div className={`forecast-accuracy forecast-accuracy--${forecastAccuracy.rating}`} role="status">
          <span className="forecast-accuracy-icon" aria-hidden="true">
            <Target size={16} />
          </span>
          <div className="forecast-accuracy-body">
            <p className="forecast-accuracy-headline">
              <span className="forecast-accuracy-rating">{ACCURACY_RATING_LABEL[forecastAccuracy.rating]}</span>
              {" — last week's forecast for this week predicted "}
              <strong>{pct(forecastAccuracy.predicted_pct)}</strong>
              {" reliable capacity; the model now computes "}
              <strong>{pct(forecastAccuracy.actual_pct)}</strong>.
            </p>
            <p className="forecast-accuracy-detail">
              {forecastAccuracy.error_pts === 0
                ? "Exactly on the mark."
                : `${forecastAccuracy.signed_error_pts > 0 ? "Over" : "Under"}-predicted by ${forecastAccuracy.error_pts} ${forecastAccuracy.error_pts === 1 ? "point" : "points"}.`}
              {" Forecast made "}
              {formatAuditTime(forecastAccuracy.record.generated_at)}.
            </p>
          </div>
        </div>
      )}
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
        <EmptyState
          icon={TrendingUp}
          title="No AI forecast yet."
          description={`The deterministic estimate is ${pct(deterministicReliableCapacity)}. Generate a forecast to add assumptions, constraints, scenarios, and planning recommendations.`}
        >
          <button className="secondary-action" type="button" onClick={onGenerate}>
            <RefreshCw size={14} />
            <span>Generate Forecast</span>
          </button>
        </EmptyState>
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
          <p className="forecast-baseline-note">
            These are the AI's scenario estimates, refined from the deterministic {pct(deterministicReliableCapacity)} reliable-capacity baseline.
          </p>
          <div
            className="forecast-range"
            role="img"
            aria-label={`Scenario range: conservative ${pct(forecast.conservative_capacity_pct)}, likely ${pct(forecast.likely_capacity_pct)}, optimistic ${pct(forecast.optimistic_capacity_pct)}`}
          >
            <div className="forecast-range-track">
              <div className="forecast-range-fill" style={{ width: `${likelyLeft}%` }} />
              <div className="forecast-range-marker" style={{ left: `${likelyLeft}%` }} />
            </div>
            <div className="forecast-range-label-row">
              <span>Conservative · {pct(forecast.conservative_capacity_pct)}</span>
              {showLikelyLabel && (
                <span className="forecast-range-label-center" style={{ left: `${likelyLeft}%` }}>Likely · {pct(forecast.likely_capacity_pct)}</span>
              )}
              <span>Optimistic · {pct(forecast.optimistic_capacity_pct)}</span>
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
