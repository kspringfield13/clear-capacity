// Shared normalization primitives for the source mappers in this package
// (calendar/outlookIcs.ts, import/rawEvents.ts). Keeping them in one place
// means the capacity heuristic stays identical across sources — tuning the
// baseline or floor in two copies is how calendar and imported blocks would
// silently drift onto different scales.

/** Minutes in a baseline 40-hour analyst week. */
export const WEEKLY_BASELINE_MINUTES = 40 * 60;

/** Deterministic djb2-xor hash → base36, for stable ids derived from content. */
export function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Estimated share of a 40-hour week a `[start, end)` span occupies, as a
 * percent floored at 0.25 so a real block never reads as exactly 0%.
 */
export function capacityPctFromSpan(start: Date, end: Date) {
  const minutes = Math.max(0, (end.getTime() - start.getTime()) / 60_000);
  return Math.max(0.25, Math.round((minutes / WEEKLY_BASELINE_MINUTES) * 100));
}
