export function RiskRow({
  label,
  value,
  tooltip,
  hint,
  displayValue,
  dangerActive,
}: {
  label: string;
  value: number;
  tooltip?: string;
  hint?: string;
  displayValue?: number;
  dangerActive?: boolean;
}) {
  const bounded = Math.max(0, Math.min(1, value));
  const shown = displayValue !== undefined ? displayValue : Math.round(bounded * 100);
  return (
    <div className="risk-row">
      <span title={tooltip}>{label}</span>
      <div
        className="risk-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={dangerActive ? `${label}: ${shown}` : `${shown} of 100`}
      >
        <span
          style={{
            width: `${bounded * 100}%`,
            ...(dangerActive ? { background: "var(--danger)" } : {}),
          }}
        />
      </div>
      <strong className={dangerActive ? "risk-blocker-count" : undefined}>
        {shown}
        {hint && <span className="risk-hint">{hint}</span>}
      </strong>
    </div>
  );
}
