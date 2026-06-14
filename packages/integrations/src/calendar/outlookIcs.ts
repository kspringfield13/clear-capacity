import type { OutlookCalendarEvent, WorkBlock } from "../../../domain/src/models";

const WEEKLY_BASELINE_MINUTES = 40 * 60;

interface IcsEventRecord {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  organizer: string | null;
  attendeeCount: number;
}

function unfoldIcsLines(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function splitIcsLine(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const nameAndParams = line.slice(0, separatorIndex);
  const [name, ...params] = nameAndParams.split(";");
  return {
    name: name.toUpperCase(),
    params,
    value: line.slice(separatorIndex + 1)
  };
}

function unescapeIcsText(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDate(value: string) {
  const normalized = value.trim();
  const dateTimeMatch = normalized.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );

  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second, utc] = dateTimeMatch;
    const numericMonth = Number(month) - 1;
    if (utc) {
      return new Date(
        Date.UTC(Number(year), numericMonth, Number(day), Number(hour), Number(minute), Number(second))
      );
    }

    return new Date(Number(year), numericMonth, Number(day), Number(hour), Number(minute), Number(second));
  }

  const dateMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOrganizer(value: string) {
  const mailto = value.match(/mailto:([^;,\s]+)/i);
  return unescapeIcsText(mailto?.[1] ?? value);
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function parseIcsEvent(lines: string[]): IcsEventRecord | null {
  let uid = "";
  let title = "Outlook meeting";
  let start: Date | null = null;
  let end: Date | null = null;
  let location: string | null = null;
  let organizer: string | null = null;
  let attendeeCount = 0;

  for (const line of lines) {
    const parsed = splitIcsLine(line);
    if (!parsed) {
      continue;
    }

    switch (parsed.name) {
      case "UID":
        uid = unescapeIcsText(parsed.value);
        break;
      case "SUMMARY":
        title = unescapeIcsText(parsed.value) || title;
        break;
      case "DTSTART":
        start = parseIcsDate(parsed.value);
        break;
      case "DTEND":
        end = parseIcsDate(parsed.value);
        break;
      case "DURATION":
        if (start && !end) {
          const minutes = Number(parsed.value.match(/PT(\d+)M/)?.[1] ?? 0);
          end = new Date(start.getTime() + minutes * 60_000);
        }
        break;
      case "LOCATION":
        location = unescapeIcsText(parsed.value) || null;
        break;
      case "ORGANIZER":
        organizer = parseOrganizer(parsed.value) || null;
        break;
      case "ATTENDEE":
        attendeeCount += 1;
        break;
      default:
        break;
    }
  }

  if (!start || !end || end <= start) {
    return null;
  }

  const stableUid = uid || `${title}-${start.toISOString()}`;
  return {
    uid: stableUid,
    title,
    start,
    end,
    location,
    organizer,
    attendeeCount
  };
}

export function parseOutlookIcs(content: string, importedAt = new Date().toISOString()) {
  const lines = unfoldIcsLines(content);
  const records: IcsEventRecord[] = [];
  let currentEventLines: string[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEventLines = [];
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEventLines) {
        const record = parseIcsEvent(currentEventLines);
        if (record) {
          records.push(record);
        }
      }
      currentEventLines = null;
      continue;
    }

    if (currentEventLines) {
      currentEventLines.push(line);
    }
  }

  const unique = new Map<string, OutlookCalendarEvent>();
  records.forEach((record) => {
    const id = `outlook-${stableHash(`${record.uid}-${record.start.toISOString()}`)}`;
    unique.set(id, {
      calendar_event_id: id,
      uid: record.uid,
      title: record.title,
      start_time: record.start.toISOString(),
      end_time: record.end.toISOString(),
      location: record.location,
      organizer: record.organizer,
      attendee_count: record.attendeeCount,
      source: "outlook_ics",
      imported_at: importedAt
    });
  });

  return [...unique.values()].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
  );
}

function capacityPctFromEvent(event: OutlookCalendarEvent) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const minutes = Math.max(0, (end.getTime() - start.getTime()) / 60_000);
  return Math.max(0.25, Math.round((minutes / WEEKLY_BASELINE_MINUTES) * 100));
}

export function outlookEventsToWorkBlocks(events: OutlookCalendarEvent[], weekId: string): WorkBlock[] {
  return events.map((event) => ({
    work_block_id: `calendar-${event.calendar_event_id}`,
    week_id: weekId,
    start_time: event.start_time,
    end_time: event.end_time,
    estimated_capacity_pct: capacityPctFromEvent(event),
    category: "Meetings / stakeholder syncs",
    mode: "Collaborative",
    planned_status: "fixed",
    project_name: event.title,
    stakeholder_group: event.organizer ?? event.location ?? "Outlook Calendar",
    derived_from: [event.calendar_event_id],
    evidence: [
      "Imported from local Outlook .ics calendar export",
      event.organizer ? `Organizer: ${event.organizer}` : "Organizer unavailable in export",
      event.attendee_count > 0 ? `${event.attendee_count} attendee records found` : "No attendee records found"
    ],
    confidence: 0.94,
    user_verified: false,
    blocker_flag: false,
    notes: event.location ? `Location: ${event.location}` : null
  }));
}
