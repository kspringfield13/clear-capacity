import { TrendingUp } from "lucide-react";
import type { PersistedForecastRecord, ForecastAccuracyReview } from "../../services/localStore";
import type { computeWeeklyCapacitySnapshot } from "../../../../../packages/inference/src/capacity";
import { pct } from "../../lib/format";
import { EmptyState } from "../common/EmptyState";
import { ForecastAgentPanel } from "./ForecastAgentPanel";

export function ForecastScreen({
  snapshot,
  nextWeekRangeLabel,
  generatedForecast,
  forecastAccuracy,
  forecastStatus,
  forecastError,
  onGenerateForecast,
  hasWorkBlocks,
}: {
  snapshot: ReturnType<typeof computeWeeklyCapacitySnapshot>;
  nextWeekRangeLabel: string;
  generatedForecast: PersistedForecastRecord | null;
  forecastAccuracy: ForecastAccuracyReview | null;
  forecastStatus: "idle" | "generating" | "error";
  forecastError: string | null;
  onGenerateForecast: () => void;
  hasWorkBlocks: boolean;
}) {
  if (!hasWorkBlocks) {
    return (
      <section className="screen forecast-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Weekly forecast</p>
            <h1>No forecast inputs yet.</h1>
          </div>
        </div>
        <EmptyState
          icon={TrendingUp}
          title="Nothing to forecast."
          description="The Forecast Agent projects next week's reliable capacity from this week's work blocks. Import Outlook events or classify active-window sessions first, then generate a forecast."
        />
      </section>
    );
  }

  return (
    <section className="screen forecast-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Weekly forecast</p>
          <h1>Next week: {nextWeekRangeLabel}.</h1>
          <p className="screen-subhead">
            The deterministic estimate is {pct(snapshot.reliable_new_work_capacity_pct)}. Generate an AI
            forecast to add assumptions, constraints, scenarios, and planning recommendations.
          </p>
        </div>
      </div>
      <ForecastAgentPanel
        generatedForecast={generatedForecast}
        forecastAccuracy={forecastAccuracy}
        nextWeekRangeLabel={nextWeekRangeLabel}
        status={forecastStatus}
        error={forecastError}
        deterministicReliableCapacity={snapshot.reliable_new_work_capacity_pct}
        onGenerate={onGenerateForecast}
      />
    </section>
  );
}
