import type { AccelerationSignal, ActivitySession } from "../../domain/src/models";

/**
 * Deterministic Acceleration miner — turns observed work into evidence-cited
 * AccelerationSignal[] with no AI and no network. Privacy: it reads ActivitySession
 * fields but emits app names, counts, and minutes only — NEVER raw window titles.
 */

const MIN_SEQUENCE_LENGTH = 2;
const MAX_SEQUENCE_LENGTH = 3;
/** A sequence must recur at least this many times to be worth surfacing. */
const MIN_RECURRENCES = 3;
/**
 * Conservative share of the observed repeated minutes that automating the handoff
 * could realistically reclaim. Deliberately low — automation rarely eliminates 100%
 * of the manual time, and the estimate feeds a user-reviewed planning aid. The
 * observed window is treated as a representative week, matching the rest of the
 * deterministic model's current-week scoping.
 */
const SAVINGS_FRACTION = 0.25;

/** Djb2 — stable, deterministic id seed (mirrors the sessionizer's local helper). */
function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Finite epoch-ms for ordering, or NEGATIVE_INFINITY for a malformed time (per the
 * Number.isFinite convention — NOT `?? 0`, which does not catch NaN). Invalid times
 * sort oldest-first so they never displace a real ordering.
 */
function comparableStartMs(iso: string) {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function finiteMinutes(value: number) {
  return Number.isFinite(value) ? value : 0;
}

interface SequenceTally {
  apps: string[];
  count: number;
  sessionIndices: Set<number>;
}

/**
 * Detect app-sequence n-grams (length 2–3) that recur ≥3 times across the user's
 * observed sessions and emit one `automate` signal per recurring sequence. Pure;
 * dedup/ranking across detectors is the aggregator's job (B4).
 */
export function detectRepetitiveSequences(sessions: ActivitySession[]): AccelerationSignal[] {
  const ordered = [...sessions].sort((left, right) => {
    const leftMs = comparableStartMs(left.start_time);
    const rightMs = comparableStartMs(right.start_time);
    return leftMs === rightMs ? 0 : rightMs > leftMs ? -1 : 1;
  });

  const signals: AccelerationSignal[] = [];

  for (let length = MIN_SEQUENCE_LENGTH; length <= MAX_SEQUENCE_LENGTH; length += 1) {
    const tallies = new Map<string, SequenceTally>();

    for (let start = 0; start + length <= ordered.length; start += 1) {
      const window = ordered.slice(start, start + length);
      const apps = window.map((session) => session.app_name);
      // A run of the same app is not a workflow transition — only count real handoffs.
      if (apps.every((app) => app === apps[0])) {
        continue;
      }

      const key = apps.join(" → ");
      let tally = tallies.get(key);
      if (!tally) {
        tally = { apps, count: 0, sessionIndices: new Set() };
        tallies.set(key, tally);
      }
      tally.count += 1;
      for (let offset = 0; offset < length; offset += 1) {
        tally.sessionIndices.add(start + offset);
      }
    }

    for (const tally of tallies.values()) {
      if (tally.count < MIN_RECURRENCES) {
        continue;
      }

      const involvedSessions = [...tally.sessionIndices].map((index) => ordered[index]);
      const repeatedMinutes = involvedSessions.reduce(
        (total, session) => total + finiteMinutes(session.duration_minutes),
        0
      );
      const estimatedSaved = Math.round(SAVINGS_FRACTION * repeatedMinutes);
      const flow = tally.apps.join(" → ");
      const confidence = Math.min(0.95, 0.5 + (tally.count - MIN_RECURRENCES) * 0.1);

      signals.push({
        signal_id: `automate-${stableHash(`seq:${flow}`)}`,
        type: "automate",
        title: `Repeating workflow: ${flow}`,
        detail: `You moved through ${flow} ${tally.count} times. Automating this handoff could reclaim about ${estimatedSaved} min/week.`,
        evidence: [
          `${flow} observed ${tally.count} times`,
          `${involvedSessions.length} sessions totaling ${Math.round(repeatedMinutes)} min of repeated work`,
          `Estimate reclaims ~${Math.round(SAVINGS_FRACTION * 100)}% of that time once automated`
        ],
        estimated_minutes_saved_per_week: estimatedSaved,
        confidence: Number(confidence.toFixed(2)),
        derived_from: involvedSessions.map((session) => session.session_id)
      });
    }
  }

  return signals;
}
