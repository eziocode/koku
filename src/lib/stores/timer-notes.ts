/**
 * Timestamped note appending for the quick-note composer.
 *
 * Quick notes land in `ActiveTimer.notes`, which already flows into
 * `TimeEntry.notes` when the timer stops — so no schema change is needed for
 * notes captured mid-session to be persisted and exported.
 */

import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime } from "@/lib/time-format";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Local clock time, matching the `timeFormat` setting. Defaults to 24h `HH:mm`. */
export function formatNoteTime(at: Date, timeFormat: TimeFormat = "24h"): string {
  return timeFormat === "12h" ? formatTime(at, "12h") : `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function formatNoteLine(text: string, at: Date, timeFormat: TimeFormat = "24h"): string {
  return `[${formatNoteTime(at, timeFormat)}] ${text.trim()}`;
}

/**
 * Appends a timestamped line, newline-joined.
 *
 * Empty input returns the existing value untouched, so an accidental Enter on an
 * empty composer can never append a bare timestamp or a stray newline.
 */
export function appendTimestampedNote(
  existing: string | null | undefined,
  text: string,
  at: Date = new Date(),
  timeFormat: TimeFormat = "24h",
): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return existing ?? null;
  }

  const line = formatNoteLine(trimmed, at, timeFormat);
  const base = (existing ?? "").replace(/\s+$/, "");
  return base ? `${base}\n${line}` : line;
}

/** One line of a timestamped note blob, split back apart for display. */
export interface NoteLine {
  stamp: string | null;
  text: string;
}

const NOTE_LINE_PATTERN = /^\[([^\]]+)\]\s*(.*)$/;

/**
 * Splits a note blob written by `appendTimestampedNote` back into its
 * individual `[HH:mm] text` lines, for surfaces (the timer session card, the
 * log page, the dashboard) that want to show each capture separately rather
 * than one run-on block. A line without a recognizable stamp (hand-typed
 * notes predate this format, or the timer's free-text description field)
 * still comes back as one entry with `stamp: null`.
 */
export function parseNoteLines(notes: string | null | undefined): NoteLine[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = NOTE_LINE_PATTERN.exec(line);
      return match ? { stamp: match[1], text: match[2] } : { stamp: null, text: line };
    });
}
