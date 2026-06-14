import type { ActiveWindowSample, ActivitySession } from "../../../domain/src/models";

const DEFAULT_SESSION_GAP_MS = 90_000;

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function sameWindowContext(left: ActiveWindowSample, right: ActiveWindowSample) {
  return left.app_name === right.app_name && (left.window_title ?? "") === (right.window_title ?? "");
}

function toSession(samples: ActiveWindowSample[]): ActivitySession {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const startMs = new Date(first.timestamp).getTime();
  const endMs = new Date(last.timestamp).getTime();
  const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));
  const evidence = [
    `Observed ${first.app_name} as the active app`,
    first.window_title ? `Front window title: ${first.window_title}` : "Window title unavailable or redacted",
    `${samples.length} active-window samples grouped locally`
  ];

  return {
    session_id: `session-${stableHash(`${first.app_name}-${first.window_title ?? ""}-${first.timestamp}`)}`,
    start_time: first.timestamp,
    end_time: last.timestamp,
    app_name: first.app_name,
    window_title: first.window_title,
    duration_minutes: durationMinutes,
    sample_count: samples.length,
    evidence
  };
}

export function sessionizeActiveWindowSamples(
  samples: ActiveWindowSample[],
  sessionGapMs = DEFAULT_SESSION_GAP_MS
): ActivitySession[] {
  const sorted = [...samples].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );
  const groups: ActiveWindowSample[][] = [];

  for (const sample of sorted) {
    const currentGroup = groups[groups.length - 1];
    const previous = currentGroup?.[currentGroup.length - 1];

    if (!currentGroup || !previous) {
      groups.push([sample]);
      continue;
    }

    const gapMs = new Date(sample.timestamp).getTime() - new Date(previous.timestamp).getTime();
    if (gapMs <= sessionGapMs && sameWindowContext(previous, sample)) {
      currentGroup.push(sample);
    } else {
      groups.push([sample]);
    }
  }

  return groups.map(toSession).sort(
    (left, right) => new Date(right.start_time).getTime() - new Date(left.start_time).getTime()
  );
}
