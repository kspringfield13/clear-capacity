import type { WorkBlock, UserCorrection, ActivitySession } from "../../../../packages/domain/src/models";

export function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function capacityPctFromMinutes(minutes: number) {
  return Math.max(0.25, Math.round((Math.max(1, minutes) / (40 * 60)) * 100));
}

export function removeSeededWorkBlocks(blocks: WorkBlock[]) {
  return blocks.filter((block) => !/^wb-\d{3}$/.test(block.work_block_id));
}

export function removeSeededCorrections(corrections: UserCorrection[]) {
  return corrections.filter((correction) => !/^wb-\d{3}$/.test(correction.work_block_id));
}

export function summarizeRecentSessions(sessions: ActivitySession[], limit = 4) {
  const summaries = new Map<
    string,
    {
      app_name: string;
      window_title: string | null;
      duration_minutes: number;
      session_count: number;
      latest_start_time: string;
    }
  >();

  sessions.slice(0, 12).forEach((session) => {
    const existing = summaries.get(session.app_name);
    if (!existing) {
      summaries.set(session.app_name, {
        app_name: session.app_name,
        window_title: session.window_title,
        duration_minutes: session.duration_minutes,
        session_count: 1,
        latest_start_time: session.start_time
      });
      return;
    }

    const sessionIsNewer = new Date(session.start_time) > new Date(existing.latest_start_time);
    summaries.set(session.app_name, {
      app_name: session.app_name,
      window_title: sessionIsNewer ? session.window_title : existing.window_title,
      duration_minutes: existing.duration_minutes + session.duration_minutes,
      session_count: existing.session_count + 1,
      latest_start_time: sessionIsNewer ? session.start_time : existing.latest_start_time
    });
  });

  return [...summaries.values()]
    .sort((left, right) => new Date(right.latest_start_time).getTime() - new Date(left.latest_start_time).getTime())
    .slice(0, limit);
}
