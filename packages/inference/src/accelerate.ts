import type {
  AccelerationSignal,
  ActivitySession,
  WorkBlock,
  WorkCategory
} from "../../domain/src/models";

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

/**
 * A standard 40h analyst week in minutes — the denominator `estimated_capacity_pct` is
 * expressed against (see integrations' `capacityPctFromSpan`). Kept as a local const because
 * the inference layer must NOT import from `apps/desktop` or the integrations package; mirror
 * a change here if the baseline ever moves.
 */
const WEEKLY_BASELINE_MINUTES = 40 * 60;

/** A category is "recurring" once it has been observed at least this many times in the week. */
const MIN_TIMESINK_BLOCKS = MIN_RECURRENCES;

/** An hour-of-day needs at least this many app switches to be worth flagging as a hotspot. */
const MIN_HOTSPOT_SWITCHES = MIN_RECURRENCES;

/**
 * An hour is a "hotspot" only when its switch count is at least this multiple of the average
 * switches across the user's active hours — i.e. switching is genuinely *concentrated* there,
 * not evenly spread through the day. (A day with only one active switching hour is treated as
 * concentrated by definition.)
 */
const HOTSPOT_CONCENTRATION_FACTOR = 1.5;

/**
 * Conservative reclaimable refocus minutes per avoided app switch. The cost of a context switch
 * is well-grounded — Mark et al. (CHI 2008) measured ~23 min to fully return to an interrupted
 * task — but batching never eliminates every switch and not every switch is a deep interruption,
 * so this is set deliberately well below that figure for a user-reviewed planning aid.
 */
const REFOCUS_MINUTES_PER_SWITCH = 3;

/**
 * Categories where an off-the-shelf tool or template has the most leverage: repetitive,
 * low-craft work that is rarely deep-focus output. Membership (not order) gates a `tool`
 * signal; the favored set comes straight from the B2 spec.
 */
const TOOLABLE_CATEGORIES: ReadonlySet<WorkCategory> = new Set<WorkCategory>([
  "Recurring reporting",
  "Admin / coordination",
  "SQL / data modeling / query work",
  "Dashboard development / edits"
]);

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

/** Convert a block's `estimated_capacity_pct` (% of the week) back into minutes. */
function minutesFromCapacityPct(pct: number) {
  return (finiteMinutes(pct) / 100) * WEEKLY_BASELINE_MINUTES;
}

/** Local hour-of-day (0–23) for an ISO timestamp, or null when it is unparseable. */
function localHourOfDay(iso: string): number | null {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.getHours() : null;
}

/** A 12-hour clock label for an hour bucket, e.g. 0 → "12am", 14 → "2pm". */
function hourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const meridiem = normalized < 12 ? "am" : "pm";
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}${meridiem}`;
}

/** A one-hour window label, e.g. 14 → "2pm–3pm". */
function hourWindowLabel(hour: number) {
  return `${hourLabel(hour)}–${hourLabel(hour + 1)}`;
}

/** The project_name accounting for the most minutes in a tally, or null when none is set. */
function dominantProject(projects: Map<string, number>) {
  let best: string | null = null;
  let bestMinutes = 0;
  for (const [project, minutes] of projects) {
    if (minutes > bestMinutes) {
      best = project;
      bestMinutes = minutes;
    }
  }
  return best;
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

interface CategoryTally {
  category: WorkCategory;
  blockCount: number;
  totalMinutes: number;
  /** Minutes in blocks the user did NOT mark as deep work — the tool-able portion. */
  lowDeepMinutes: number;
  blockIds: string[];
  /** project_name → minutes, so the signal can cite where the time concentrates. */
  projects: Map<string, number>;
}

/**
 * Detect recurring, low-deep-work time-sinks from the user's reviewed WorkBlocks and emit one
 * `tool` signal per tool-able category that is both recurring (≥3 blocks) and dominated by
 * non-deep work. Evidence cites the category, hours/week, the non-deep share, and the dominant
 * project — derived labels and counts only, never window titles. Pure; dedup/ranking across
 * detectors is the aggregator's job (B4).
 *
 * `sessions` is accepted for parity with the other detectors' signatures (B4 fans the same
 * inputs across B1–B3); this miner works from the reviewed blocks, which already carry the
 * category/mode/capacity labels it needs.
 */
export function detectTimeSinks(
  blocks: WorkBlock[],
  sessions: ActivitySession[]
): AccelerationSignal[] {
  void sessions;

  const tallies = new Map<WorkCategory, CategoryTally>();

  for (const block of blocks) {
    if (!TOOLABLE_CATEGORIES.has(block.category)) {
      continue;
    }

    const minutes = minutesFromCapacityPct(block.estimated_capacity_pct);

    let tally = tallies.get(block.category);
    if (!tally) {
      tally = {
        category: block.category,
        blockCount: 0,
        totalMinutes: 0,
        lowDeepMinutes: 0,
        blockIds: [],
        projects: new Map()
      };
      tallies.set(block.category, tally);
    }

    tally.blockCount += 1;
    tally.totalMinutes += minutes;
    if (block.mode !== "Deep work") {
      tally.lowDeepMinutes += minutes;
    }
    tally.blockIds.push(block.work_block_id);
    if (block.project_name) {
      tally.projects.set(block.project_name, (tally.projects.get(block.project_name) ?? 0) + minutes);
    }
  }

  const signals: AccelerationSignal[] = [];

  for (const tally of tallies.values()) {
    // Recurring (observed ≥3 times) AND dominated by non-deep work — the tool-able profile.
    if (tally.blockCount < MIN_TIMESINK_BLOCKS || tally.lowDeepMinutes <= 0) {
      continue;
    }

    const estimatedSaved = Math.round(SAVINGS_FRACTION * tally.lowDeepMinutes);
    if (estimatedSaved <= 0) {
      continue;
    }

    // totalMinutes > 0 here because lowDeepMinutes > 0, so the share denominator is safe.
    const hoursPerWeek = tally.totalMinutes / 60;
    const lowDeepShare = tally.lowDeepMinutes / tally.totalMinutes;
    const confidence = Math.min(
      0.9,
      0.5 + (tally.blockCount - MIN_TIMESINK_BLOCKS) * 0.08 + lowDeepShare * 0.1
    );

    const evidence = [
      `${tally.category} took about ${hoursPerWeek.toFixed(1)}h across ${tally.blockCount} blocks`,
      `${Math.round(lowDeepShare * 100)}% of that time was outside deep work — repetitive, tool-able effort`,
      `Recurring: observed ${tally.blockCount} times (≥${MIN_TIMESINK_BLOCKS} marks a recurring pattern)`
    ];
    const topProject = dominantProject(tally.projects);
    if (topProject) {
      evidence.push(`Most of it sits in "${topProject}"`);
    }

    signals.push({
      signal_id: `tool-${stableHash(`timesink:${tally.category}`)}`,
      type: "tool",
      title: `Time sink: ${tally.category}`,
      detail: `${tally.category} is taking about ${hoursPerWeek.toFixed(1)}h/week, mostly outside deep work. A purpose-built tool or template could reclaim roughly ${estimatedSaved} min/week.`,
      evidence,
      estimated_minutes_saved_per_week: estimatedSaved,
      confidence: Number(confidence.toFixed(2)),
      derived_from: tally.blockIds
    });
  }

  // Sensible standalone ordering (B4 re-ranks): biggest reclaimable time first, id as tie-break.
  signals.sort((left, right) => {
    if (left.estimated_minutes_saved_per_week !== right.estimated_minutes_saved_per_week) {
      return right.estimated_minutes_saved_per_week - left.estimated_minutes_saved_per_week;
    }
    return left.signal_id < right.signal_id ? -1 : left.signal_id > right.signal_id ? 1 : 0;
  });

  return signals;
}

interface HourSwitchTally {
  hour: number;
  count: number;
  /** session_ids on either side of a switch bucketed to this hour — the cited evidence. */
  sessionIds: Set<string>;
}

/**
 * Detect hours-of-day where app switching is concentrated and emit one `technique` signal per
 * hotspot, with a batching/focus angle in `detail`. A "switch" is a handoff between consecutive
 * sessions whose `app_name` changes — the same notion of a real handoff `detectRepetitiveSequences`
 * uses, and the session-level analog of the block-mode fragmentation that drives `context_switch_score`
 * in `capacity.ts` (both treat reactive app-hopping as the fragmentation cost, so the two agree).
 * Switches are bucketed by the local hour the user switched *into* the new app. Pure; dedup/ranking
 * across detectors is the aggregator's job (B4).
 *
 * Privacy: reads `ActivitySession` fields but evidence carries app-switch counts, an hour window,
 * and a share percentage only — never window titles.
 */
export function detectContextSwitchHotspots(sessions: ActivitySession[]): AccelerationSignal[] {
  const ordered = [...sessions].sort((left, right) => {
    const leftMs = comparableStartMs(left.start_time);
    const rightMs = comparableStartMs(right.start_time);
    return leftMs === rightMs ? 0 : rightMs > leftMs ? -1 : 1;
  });

  const tallies = new Map<number, HourSwitchTally>();
  let totalSwitches = 0;

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.app_name === current.app_name) {
      continue;
    }

    // Bucket by the hour the user switched into the new app; an unparseable time can't be placed.
    const hour = localHourOfDay(current.start_time);
    if (hour === null) {
      continue;
    }

    let tally = tallies.get(hour);
    if (!tally) {
      tally = { hour, count: 0, sessionIds: new Set() };
      tallies.set(hour, tally);
    }
    tally.count += 1;
    tally.sessionIds.add(previous.session_id);
    tally.sessionIds.add(current.session_id);
    totalSwitches += 1;
  }

  if (totalSwitches === 0) {
    return [];
  }

  const activeHours = tallies.size;
  const meanPerActiveHour = totalSwitches / activeHours;
  const signals: AccelerationSignal[] = [];

  for (const tally of tallies.values()) {
    const concentrated =
      activeHours <= 1 || tally.count >= meanPerActiveHour * HOTSPOT_CONCENTRATION_FACTOR;
    if (tally.count < MIN_HOTSPOT_SWITCHES || !concentrated) {
      continue;
    }

    const estimatedSaved = Math.round(REFOCUS_MINUTES_PER_SWITCH * tally.count);
    if (estimatedSaved <= 0) {
      continue;
    }

    const timeWindow = hourWindowLabel(tally.hour);
    const share = tally.count / totalSwitches;
    const sharePct = Math.max(1, Math.round(share * 100));
    const confidence = Math.min(0.9, 0.5 + (tally.count - MIN_HOTSPOT_SWITCHES) * 0.05 + share * 0.1);

    signals.push({
      signal_id: `technique-${stableHash(`hotspot:${tally.hour}`)}`,
      type: "technique",
      title: `Context-switch hotspot: ${timeWindow}`,
      detail: `You switch apps most around ${timeWindow} — about ${tally.count} switches there. Batching similar work into one block, or guarding ${timeWindow} for focused work, cuts the refocus tax of jumping between tools.`,
      evidence: [
        `${tally.count} app switches concentrated in ${timeWindow}`,
        `${sharePct}% of the day's ${totalSwitches} observed app switches happen then`,
        `Each avoided switch reclaims ~${REFOCUS_MINUTES_PER_SWITCH} min of refocus time`
      ],
      estimated_minutes_saved_per_week: estimatedSaved,
      confidence: Number(confidence.toFixed(2)),
      derived_from: [...tally.sessionIds]
    });
  }

  // Sensible standalone ordering (B4 re-ranks): busiest switching hour first, id as tie-break.
  signals.sort((left, right) => {
    if (left.estimated_minutes_saved_per_week !== right.estimated_minutes_saved_per_week) {
      return right.estimated_minutes_saved_per_week - left.estimated_minutes_saved_per_week;
    }
    return left.signal_id < right.signal_id ? -1 : left.signal_id > right.signal_id ? 1 : 0;
  });

  return signals;
}
