import type { ActivitySession } from "../../../../../packages/domain/src/models";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function buildGrid(sessions: ActivitySession[]): number[][] {
  // grid[dayOffset][hour] = total minutes; dayOffset 0 = today, 6 = oldest
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const session of sessions) {
    const d = new Date(session.start_time);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayStart.getTime() - dayStart.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays >= 7) continue;
    grid[diffDays][d.getHours()] += session.duration_minutes;
  }

  return grid;
}

function getDayLabel(diffDays: number): string {
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yest.";
  const d = new Date();
  d.setDate(d.getDate() - diffDays);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function getDayFullLabel(diffDays: number): string {
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() - diffDays);
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function formatHour(h: number): string {
  const h24 = h % 24;
  if (h24 === 0) return "12a";
  if (h24 === 12) return "12p";
  return h24 < 12 ? `${h24}a` : `${h24 - 12}p`;
}

function formatHourA11y(h: number): string {
  const h24 = h % 24;
  if (h24 === 0) return "12 am";
  if (h24 === 12) return "12 pm";
  return h24 < 12 ? `${h24} am` : `${h24 - 12} pm`;
}

export function ActivityHeatmap({ sessions }: { sessions: ActivitySession[] }) {
  if (sessions.length === 0) return null;

  const grid = buildGrid(sessions);
  const daysWithActivity = grid.reduce((acc, row) => acc + (row.some(v => v > 0) ? 1 : 0), 0);

  if (daysWithActivity < 2) {
    return (
      <details className="activity-heatmap" open>
        <summary className="eyebrow">7-day activity pattern</summary>
        <p className="heatmap-sparse-caption">Limited activity so far — the pattern fills in as you keep tracking.</p>
      </details>
    );
  }

  let max = 0;
  for (const row of grid) for (const v of row) if (v > max) max = v;

  const peakMin = Math.round(max);

  return (
    <details className="activity-heatmap">
      <summary className="eyebrow">7-day activity pattern</summary>
      <div
        className="heatmap-grid"
        role="group"
        aria-label={`7-day activity heatmap, peak ${peakMin} min`}
      >
        <div className="heatmap-hour-axis" aria-hidden="true">
          <div className="heatmap-day-label" />
          {HOURS.map(h => (
            <div key={h} className="heatmap-hour-label">
              {h % 6 === 0 ? formatHour(h) : ""}
            </div>
          ))}
        </div>
        {[6, 5, 4, 3, 2, 1, 0].map(diffDays => (
          <div key={diffDays} className="heatmap-day-col">
            <div className="heatmap-day-label" aria-hidden="true">{getDayLabel(diffDays)}</div>
            {HOURS.map(h => {
              const minutes = grid[diffDays][h];
              const level = max > 0 ? Math.ceil((minutes / max) * 5) : 0;
              const tip = minutes > 0
                ? `${getDayLabel(diffDays)} ${formatHour(h)}–${formatHour(h + 1)} · ${Math.round(minutes)} min`
                : undefined;
              const cellLabel = minutes > 0
                ? `${getDayFullLabel(diffDays)} ${formatHourA11y(h)}–${formatHourA11y((h + 1) % 24)}, ${Math.round(minutes)} min`
                : undefined;
              return (
                <div
                  key={h}
                  className="heatmap-cell"
                  data-level={level}
                  title={tip}
                  role={minutes > 0 ? "img" : undefined}
                  aria-label={cellLabel}
                  aria-hidden={minutes === 0 ? true : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span className="heatmap-legend-label">Less</span>
        {[1, 2, 3, 4, 5].map(level => (
          <div key={level} className="heatmap-cell" data-level={level} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>
    </details>
  );
}
