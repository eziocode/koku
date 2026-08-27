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
