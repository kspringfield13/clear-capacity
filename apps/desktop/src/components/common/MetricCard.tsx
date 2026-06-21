import { pct } from "../../lib/format";

export function MetricCard({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{typeof value === "number" ? pct(value) : value}</strong>
      <small>{helper}</small>
    </div>
  );
}
