import {
  importRawEvents,
  type ImportRawEventsOptions,
  type RawEventImport,
  type RawEventImportResult
} from "../import/rawEvents";

/**
 * Workplace chat → reactive-work signal.
 *
 * Chat is the one source that exposes interruption load and ad-hoc/reactive
 * work — the part of the capacity model that calendar + git can't see. A burst
 * of messages (especially mentions) over a short window is a reactive
 * interruption; this module turns a *provider-neutral, metadata-only* chat
 * export into reactive `WorkBlock`s by:
 *   1. {@link parseChatExport} — JSON export → {@link ChatMessageRecord}[]
 *   2. {@link chatMessagesToImport} — messages → session {@link RawEventImport}[]
 *      (consecutive messages within a provider collapse into one reactive block)
 *   3. {@link importChatExport} — the full pipeline, normalized through the
 *      shared {@link importRawEvents} so capacity/id/dedup heuristics stay
 *      identical to every other source.
 *
 * ## Single generic `chat` source — vendor rides on `provider`
 *
 * There is ONE `chat` `SourceType`, not one per vendor: most orgs standardize
 * on a single chat app, so the workload signal is identical across
 * Slack / Microsoft Teams / Webex. The specific app rides on the per-message
 * `provider` field (and, later, the `ChatSource` descriptor), never as a
 * separate source type.
 *
 * ## Privacy — METADATA ONLY (hard constraint)
 *
 * Message bodies are sensitive like window titles. This whole family is
 * metadata-only: timestamps, channel/DM/thread surface, direction, mention
 * flag, thread id, participant counts, and (non-secret) channel names. The
 * parser reads ONLY the whitelisted fields below — it has no field that could
 * carry message text, so even an export that includes a `text`/`body` field is
 * never read, stored in evidence, or sent anywhere.
 *
 * ## Export contract (JSON)
 *
 * Pass an array, a `{ "messages": [...] }` wrapper, or the JSON string of
 * either. Each element is a metadata-only message:
 *
 * ```json
 * {
 *   "timestamp": "2026-06-22T09:01:00Z",
 *   "provider": "slack",        // slack | teams | webex
 *   "surface": "channel",       // channel | dm | thread
 *   "direction": "received",    // sent | received
 *   "mentioned_me": true,
 *   "thread_id": "T-1042",
 *   "participant_count": 6,
 *   "channel_name": "#data-requests"
 * }
 * ```
 *
 * Only `timestamp` and `provider` are required; everything else falls back to a
 * sensible default (`surface: "channel"`, `direction: "received"`,
 * `mentioned_me: false`). Malformed messages (missing/invalid timestamp or an
 * unrecognized provider) are dropped, mirroring `parseGitLog` / `parseOutlookIcs`.
 *
 * The live Slack Web API / Microsoft Graph / Webex fetch is **[manual / Rust]**
 * — it belongs in `apps/desktop/src-tauri/` (OAuth + native fetch) and is a
 * follow-up. This module is the pure, testable half that the Rust side feeds.
 */

/** Supported chat vendors. The signal is vendor-uniform; this only labels it. */
export type ChatProvider = "slack" | "teams" | "webex";

/** Where a message was exchanged. */
export type ChatSurface = "channel" | "dm" | "thread";

/** Direction relative to the user. */
export type ChatDirection = "sent" | "received";

/** A single parsed, metadata-only chat message. Carries NO message text. */
export interface ChatMessageRecord {
  timestamp: Date;
  provider: ChatProvider;
  surface: ChatSurface;
  direction: ChatDirection;
  /** True when the user was @-mentioned (an interruption signal). */
  mentioned_me: boolean;
  thread_id: string | null;
  participant_count: number | null;
  /** Channel/DM display name — a label, never message content. */
  channel_name: string | null;
}

export interface ChatExportOptions extends ImportRawEventsOptions {
  /** Messages more than this many minutes apart start a new reactive block. */
  sessionGapMinutes?: number;
  /** Minutes of attention assumed before a burst's first message. */
  leadMinutes?: number;
}

const CHAT_PROVIDERS: readonly ChatProvider[] = ["slack", "teams", "webex"];
const CHAT_SURFACES: readonly ChatSurface[] = ["channel", "dm", "thread"];
const CHAT_DIRECTIONS: readonly ChatDirection[] = ["sent", "received"];

/** Human label for a provider, used in the imported event's `app_name`. */
const PROVIDER_LABEL: Record<ChatProvider, string> = {
  slack: "Slack",
  teams: "Microsoft Teams",
  webex: "Webex"
};

// Chat bursts are tighter than coding sessions, so the default gap is shorter
// than gitLog's 90m and the lead is small (a reactive ping costs a few minutes
// of context switch, not a half-hour of ramp-up).
const DEFAULT_SESSION_GAP_MINUTES = 20;
const DEFAULT_LEAD_MINUTES = 5;

/** Normalize common vendor aliases to the canonical provider id. */
function normalizeProvider(value: unknown): ChatProvider | null {
  if (typeof value !== "string") {
    return null;
  }
  const key = value.trim().toLowerCase();
  if (CHAT_PROVIDERS.includes(key as ChatProvider)) {
    return key as ChatProvider;
  }
  if (key === "microsoft_teams" || key === "ms_teams" || key === "msteams") {
    return "teams";
  }
  if (key === "cisco_webex" || key === "webex_teams") {
    return "webex";
  }
  return null;
}

function normalizeSurface(value: unknown): ChatSurface {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CHAT_SURFACES.includes(key as ChatSurface) ? (key as ChatSurface) : "channel";
}

function normalizeDirection(value: unknown): ChatDirection {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CHAT_DIRECTIONS.includes(key as ChatDirection) ? (key as ChatDirection) : "received";
}

function normalizeCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
}

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Parse a metadata-only chat export into message records. Accepts an array, a
 * `{ messages: [...] }` (or `{ events: [...] }`) wrapper, or the JSON string of
 * either (throws `SyntaxError` on malformed JSON, matching `JSON.parse`).
 * Messages missing a valid `timestamp` or a recognized `provider` are dropped,
 * mirroring the lenient handling in `parseGitLog` / `parseOutlookIcs`.
 *
 * Only the whitelisted metadata fields are read — there is intentionally no
 * field that could carry message text.
 */
export function parseChatExport(
  content: string | unknown[] | { messages?: unknown[] }
): ChatMessageRecord[] {
  const data = typeof content === "string" ? JSON.parse(content) : content;
  let rows: unknown[] = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === "object" && Array.isArray((data as { messages?: unknown }).messages)) {
    rows = (data as { messages: unknown[] }).messages;
  }

  const records: ChatMessageRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const message = row as Record<string, unknown>;
    const provider = normalizeProvider(message.provider);
    if (!provider) {
      continue;
    }
    const timestamp = new Date(typeof message.timestamp === "string" ? message.timestamp : NaN);
    if (Number.isNaN(timestamp.getTime())) {
      continue;
    }

    records.push({
      timestamp,
      provider,
      surface: normalizeSurface(message.surface),
      direction: normalizeDirection(message.direction),
      mentioned_me: message.mentioned_me === true,
      thread_id: normalizeLabel(message.thread_id),
      participant_count: normalizeCount(message.participant_count),
      channel_name: normalizeLabel(message.channel_name)
    });
  }

  return records;
}

/**
 * Group messages into reactive bursts and emit one `RawEventImport` per burst.
 *
 * Messages are grouped by provider, sorted by time, then split wherever two
 * consecutive messages are more than `sessionGapMinutes` apart — exactly how
 * {@link gitCommitsToImport} splits commits. Each burst spans `leadMinutes`
 * before its first message through its last message, so even a lone ping gets a
 * non-zero block. The emitted metadata is counts + channel/participant labels
 * only; there is no message text.
 */
export function chatMessagesToImport(
  messages: ChatMessageRecord[],
  options: ChatExportOptions = {}
): RawEventImport[] {
  const gapMs = Math.max(0, options.sessionGapMinutes ?? DEFAULT_SESSION_GAP_MINUTES) * 60_000;
  const leadMs = Math.max(0, options.leadMinutes ?? DEFAULT_LEAD_MINUTES) * 60_000;

  const byProvider = new Map<ChatProvider, ChatMessageRecord[]>();
  for (const message of messages) {
    const list = byProvider.get(message.provider);
    if (list) {
      list.push(message);
    } else {
      byProvider.set(message.provider, [message]);
    }
  }

  const imports: RawEventImport[] = [];
  for (const [provider, providerMessages] of byProvider) {
    const sorted = [...providerMessages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let session: ChatMessageRecord[] = [];

    const flush = () => {
      if (session.length === 0) {
        return;
      }
      const first = session[0];
      const last = session[session.length - 1];
      const end = last.timestamp;
      // Pad backwards by leadMs, but never collapse to a zero-length span:
      // importRawEvents drops any record with end <= start, which would
      // silently lose a lone message.
      const start = new Date(Math.min(first.timestamp.getTime() - leadMs, end.getTime() - 60_000));

      const received = session.filter((m) => m.direction === "received").length;
      const sent = session.length - received;
      const mentions = session.filter((m) => m.mentioned_me).length;
      const channels = [...new Set(session.map((m) => m.channel_name).filter((c): c is string => c !== null))];
      const surfaces = [...new Set(session.map((m) => m.surface))];
      const threads = new Set(session.map((m) => m.thread_id).filter((t): t is string => t !== null)).size;
      const participantCounts = session
        .map((m) => m.participant_count)
        .filter((n): n is number => n !== null);
      const maxParticipants = participantCounts.length > 0 ? Math.max(...participantCounts) : null;

      // Metadata-only: counts + channel/participant labels. NO message text.
      const metadata: Record<string, string> = {
        provider,
        messages: String(session.length),
        received: String(received),
        sent: String(sent),
        mentions: String(mentions),
        surfaces: surfaces.join(", ")
      };
      if (channels.length > 0) {
        metadata.channels = channels.join(", ");
      }
      if (threads > 0) {
        metadata.threads = String(threads);
      }
      if (maxParticipants !== null) {
        metadata.participants = String(maxParticipants);
      }

      // A single dominant channel labels the block; mixed-channel bursts fall
      // back to a generic reactive-messaging name.
      const singleChannel = channels.length === 1 ? channels[0] : null;

      imports.push({
        // Sessions within a provider never overlap (sorted + gap-split), so the
        // first message's instant keys the burst uniquely per provider.
        event_id: `chat-${provider}-${first.timestamp.toISOString()}`,
        timestamp_start: start.toISOString(),
        timestamp_end: end.toISOString(),
        source_type: "chat",
        app_name: PROVIDER_LABEL[provider],
        project_hint: singleChannel,
        project_name: singleChannel ?? "Reactive messaging",
        metadata
      });
      session = [];
    };

    for (const message of sorted) {
      if (
        session.length > 0 &&
        message.timestamp.getTime() - session[session.length - 1].timestamp.getTime() > gapMs
      ) {
        flush();
      }
      session.push(message);
    }
    flush();
  }

  return imports;
}

/**
 * Full pipeline: parse a metadata-only chat export, sessionize it into reactive
 * bursts, and normalize through {@link importRawEvents}. Returns
 * `{ events, work_blocks, skipped }` exactly like every other source import —
 * the work blocks are reactive (`Ad hoc stakeholder requests` / `Reactive` /
 * `unplanned`), keyed by provider → burst.
 */
export function importChatExport(
  content: string | unknown[] | { messages?: unknown[] },
  options: ChatExportOptions = {}
): RawEventImportResult {
  const messages = parseChatExport(content);
  const imports = chatMessagesToImport(messages, options);
  return importRawEvents(imports, { weekId: options.weekId, userId: options.userId });
}
