import { formatTime } from "@/lib/time-format";
import type { TimeFormat } from "@/lib/settings/schema";

/** Framework-free duration entry, mirroring the id/label + pure resolver shape of `notifications/dnd.ts`. */

export type DurationUnit = "min" | "hr";

/**
 * The quick choices offered wherever a duration is picked.
 *
 * Short presets behave differently per surface, and both behaviours are correct:
 * breaks and timers are exact, because nothing counts down (every elapsed value
 * is derived from a stored timestamp plus an injected `now`, so a throttled tab
 * renders late but never measures wrong), while reminders are best effort within
 * about a minute, because `reminders/reminder-scheduler.tsx` polls and a hidden
 * tab is clamped to roughly one wake per minute. This is not in tension with the
 * `MIN_INTERVAL_MINUTES` floor documented in `notifications/settings.ts`: that
 * floor guards a *recurring* schedule, where a throttled tab compounds into
 * drift, whereas these are one shot.
 */
export const DURATION_PRESET_MINUTES = [2, 5, 10] as const;

export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 24 * 60;

const MINUTES_PER_HOUR = 60;

/** Whole minutes for an amount entered in `unit`. */
export function toMinutes(amount: number, unit: DurationUnit): number {
  const scaled = unit === "hr" ? amount * MINUTES_PER_HOUR : amount;
  return Math.round(scaled);
}

/**
 * The amount and unit a minute count should be *edited* as.
 *
 * Only exact multiples of an hour become hours, so 90 stays `90 min` rather than
 * turning into a fractional `1.5 hr` that a whole-number stepper cannot express.
 */
export function fromMinutes(minutes: number): { amount: number; unit: DurationUnit } {
  if (minutes >= MINUTES_PER_HOUR && minutes % MINUTES_PER_HOUR === 0) {
    return { amount: minutes / MINUTES_PER_HOUR, unit: "hr" };
  }
  return { amount: minutes, unit: "min" };
}

/** Clamps to the pickable range, treating a non-finite value as the floor. */
export function clampDurationMinutes(minutes: number, max = MAX_DURATION_MINUTES): number {
  if (!Number.isFinite(minutes)) return MIN_DURATION_MINUTES;
  return Math.min(Math.max(Math.round(minutes), MIN_DURATION_MINUTES), max);
}

export function isValidDurationAmount(
  amount: number,
  unit: DurationUnit,
  max = MAX_DURATION_MINUTES,
): boolean {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return false;
  const minutes = toMinutes(amount, unit);
  return minutes >= MIN_DURATION_MINUTES && minutes <= max;
}

/**
 * The absolute instant "in N minutes" resolves to.
 *
 * Deliberately plain arithmetic on the epoch, unlike `computeDndUntilIso`'s
 * "tomorrow": elapsed time is elapsed time, so `now + n` is correct across a DST
 * boundary by definition. Mutating a local `Date` here would introduce the very
 * one-hour drift that the DND helper mutates a `Date` to avoid.
 */
export function resolveDurationIso(minutes: number, now: Date): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** `"2 min"`, `"1 hr"`, `"1 hr 30 min"`. */
export function formatDurationLabel(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

/**
 * The wall-clock time a duration lands on, for the picker's hint line.
 *
 * A preview only: the caller resolves the instant again at submit time, so a
 * form left open for ten minutes still schedules from when it was submitted.
 */
export function formatResolvedAt(minutes: number, now: Date, timeFormat: TimeFormat): string {
  const at = new Date(now.getTime() + minutes * 60_000);
  const time = formatTime(at, timeFormat);
  const dayShift = at.getDate() !== now.getDate() || at.getMonth() !== now.getMonth();
  return dayShift ? `${time} tomorrow` : time;
}
