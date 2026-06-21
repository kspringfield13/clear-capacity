export function ConfidenceChip({ value }: { value: number }) {
  const level = value >= 0.85 ? "High" : value >= 0.74 ? "Medium" : "Needs review";
  return <span className={`confidence ${level === "Needs review" ? "low" : level.toLowerCase()}`}>{level} {Math.round(value * 100)}%</span>;
}
