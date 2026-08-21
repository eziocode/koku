/**
 * Timestamped note appending for the quick-note composer.
 *
 * Quick notes land in `ActiveTimer.notes`, which already flows into
 * `TimeEntry.notes` when the timer stops — so no schema change is needed for
 * notes captured mid-session to be persisted and exported.
 */

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Local `HH:mm`, matching how the rest of the app renders times. */
export function formatNoteTime(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function formatNoteLine(text: string, at: Date): string {
  return `[${formatNoteTime(at)}] ${text.trim()}`;
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
): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return existing ?? null;
  }

  const line = formatNoteLine(trimmed, at);
  const base = (existing ?? "").replace(/\s+$/, "");
  return base ? `${base}\n${line}` : line;
}
