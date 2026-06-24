export function ConfidenceChip({ value }: { value: number }) {
  if (value === 0) {
    return <span className="confidence unscored">Unscored</span>;
  }
  const pct = Math.round(value * 100);
  const level = value >= 0.85 ? "High" : value >= 0.74 ? "Medium" : "Needs review";
  return <span className={`confidence ${level === "Needs review" ? "low" : level.toLowerCase()}`} title={`${pct}% classification confidence`}>{level} {pct}%</span>;
}
