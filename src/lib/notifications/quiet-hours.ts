import type { NotificationPreferences } from "@/lib/notifications/settings";

export const MINUTES_IN_DAY = 24 * 60;

export function toMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** `"22:00"` ⇄ `1320`, for binding to `<input type="time">`. */
export function minutesToTimeInput(minutes: number): string {
  const clamped = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(clamped / 60);
  return `${hours.toString().padStart(2, "0")}:${(clamped % 60).toString().padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Whether `now` falls inside the quiet-hours window.
 *
 * The window normally wraps past midnight (the default is 22:00 → 08:00), so a
 * naive `start <= now && now < end` comparison would be wrong for the common
 * case. When `start > end` the window is treated as spanning midnight.
 *
 * `start === end` means "no quiet hours" rather than "all day": a zero-width
 * window is far more likely to be a half-finished edit than a request for
 * permanent silence, and permanent silence is already available via DND.
 */
export function isWithinQuietHours(
  now: Date,
  quietHours: Pick<NotificationPreferences["quietHours"], "startMinute" | "endMinute">,
): boolean {
  const { startMinute, endMinute } = quietHours;
  if (startMinute === endMinute) {
    return false;
  }

  const minute = toMinuteOfDay(now);

  return startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
}
