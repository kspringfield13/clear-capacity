import type { AccelerationSignal, AuditEvent, PrivacyLevel } from "../../../../packages/domain/src/models";

export function createAuditEvent(
  input: Omit<AuditEvent, "event_id" | "timestamp"> & { timestamp?: string }
): AuditEvent {
  return {
    ...input,
    event_id: crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString()
  };
}

/**
 * Build the audit event for a workplace-chat import (mirrors the inline
 * `calendar_import` event). Chat imports are METADATA ONLY — the parser whitelists
 * timestamps, channel/participant labels, and counts and has no message-text
 * field — so the recorded details affirm that invariant (`message_text: false`)
 * and never carry message content. A local file import is not a network call, so
 * `privacy_level` is `local_only`.
 */
export function createChatImportAuditEvent(input: {
  fileName: string;
  importedBlockCount: number;
  skippedRecordCount: number;
}): AuditEvent {
  const { fileName, importedBlockCount, skippedRecordCount } = input;
  return createAuditEvent({
    type: "chat_import",
    source: "chat_export",
    title: "Workplace chat imported",
    summary: `${importedBlockCount} reactive block${importedBlockCount === 1 ? "" : "s"} from ${fileName}`,
    privacy_level: "local_only",
    details: {
      file_name: fileName,
      imported_block_count: importedBlockCount,
      skipped_record_count: skippedRecordCount,
      stored_locally: true,
      sent_to_cloud: false,
      message_text: false
    }
  });
}

/**
 * Build the audit event for a discrete user action on an Acceleration Play: bookmark
 * (`saved`), hide (`dismissed`), or snapshot its generated recipe into the Saved Skills
 * library (`saved_to_library`). Plays are mined from the user's observed work, so the event
 * is `derived_only`: its details carry only the signal id, play type, derived source ids,
 * and the estimated minutes — never raw window titles (the miner never emits them;
 * `window_titles: false` affirms the invariant). The deterministic miner re-derives plays
 * continuously, so only the DISCRETE user actions are logged here; the AI-synthesis
 * "generated" event lands in the opt-in AI layer (D2), where a network call makes it the
 * discrete action to record.
 */
export function createAccelerationPlayAuditEvent(input: {
  action: "saved" | "dismissed" | "saved_to_library";
  signal: AccelerationSignal;
}): AuditEvent {
  const { action, signal } = input;
  const titles: Record<typeof action, string> = {
    saved: "Acceleration play saved",
    dismissed: "Acceleration play dismissed",
    saved_to_library: "Acceleration skill saved to library"
  };
  const summaries: Record<typeof action, string> = {
    saved: `Saved the "${signal.title}" play`,
    dismissed: `Dismissed the "${signal.title}" play`,
    saved_to_library: `Saved the "${signal.title}" skill recipe to your library`
  };
  return createAuditEvent({
    type: "acceleration_engine",
    source: "acceleration_engine",
    title: titles[action],
    summary: `${summaries[action]} (~${signal.estimated_minutes_saved_per_week} min/week)`,
    privacy_level: "derived_only",
    details: {
      action,
      signal_id: signal.signal_id,
      play_type: signal.type,
      estimated_minutes_saved_per_week: signal.estimated_minutes_saved_per_week,
      derived_from: signal.derived_from,
      window_titles: false,
      stored_locally: true,
      sent_to_cloud: false
    }
  });
}
