import { pct } from "../../lib/format";
import { CapacityRing } from "./CapacityRing";

export function MetricCard({
  label,
  value,
  helper,
  showRing,
}: {
  label: string;
  value: number | string;
  helper: string;
  showRing?: boolean;
}) {
  return (
    <div className={`metric-card${showRing ? " has-ring" : ""}`}>
      <span>{label}</span>
      {showRing && typeof value === "number" ? (
        <div className="metric-ring-row">
          <CapacityRing value={value} />
          <strong>{pct(value)}</strong>
        </div>
      ) : (
        <strong>{typeof value === "number" ? pct(value) : value}</strong>
      )}
      <small>{helper}</small>
    </div>
  );
}
