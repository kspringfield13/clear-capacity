import { pct } from "../../lib/format";

export function BarLine({ label, value, tone }: { label: string; value: number; tone: "blue" | "red" | "teal" | "purple" }) {
  return (
    <div className="bar-line">
      <div>
        <span>{label}</span>
        <strong>{pct(value)}</strong>
      </div>
      <div className="bar-track">
        <span className={tone} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}
