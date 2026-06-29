import type { AuditEvent, PrivacyLevel } from "../../../../packages/domain/src/models";

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
