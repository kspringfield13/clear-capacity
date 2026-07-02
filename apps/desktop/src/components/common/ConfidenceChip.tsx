export function ConfidenceChip({ value, glossLabel = "classification" }: { value: number; glossLabel?: string }) {
  if (value === 0 || !Number.isFinite(value)) {
    return <span className="confidence unscored">Unscored</span>;
  }
  const pct = Math.round(value * 100);
  const level = value >= 0.85 ? "High" : value >= 0.74 ? "Medium" : "Needs review";
  return <span className={`confidence ${level === "Needs review" ? "low" : level.toLowerCase()}`} title={`${pct}% ${glossLabel} confidence`}>{level} {pct}%</span>;
}
