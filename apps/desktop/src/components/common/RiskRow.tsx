export function RiskRow({ label, value }: { label: string; value: number }) {
  const bounded = Math.max(0, Math.min(1, value));
  return (
    <div className="risk-row">
      <span>{label}</span>
      <div className="risk-track">
        <span style={{ width: `${bounded * 100}%` }} />
      </div>
      <strong>{Math.round(bounded * 100)}</strong>
    </div>
  );
}
