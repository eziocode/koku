/**
 * Pure hour-of-day domain math for the segmented bar chart's axis.
 *
 * Kept out of `segmented-bar-chart.tsx` (a `"use client"` component that
 * several pages lazy-load via `next/dynamic`) so that a plain call site — one
 * that only needs `deriveFallbackHours` to compute a prop, say — doesn't pull
 * the whole chart component into its bundle.
 */

import type { NotificationPreferences } from "@/lib/notifications/settings";
import { timeInputToMinutes } from "@/lib/notifications/quiet-hours";
import type { SegmentedDay } from "@/lib/charts/segments";

export function hourOfDay(iso: string): number {
  const date = new Date(iso);
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** An hour-of-day window the chart's axis spans. Always a sub-range of `[0, 24]`. */
export interface HourDomain {
  start: number;
  end: number;
}

/** The full day — used when nothing narrower has been computed yet. */
export const FULL_DAY_DOMAIN: HourDomain = { start: 0, end: 24 };

/**
 * Axis window for a chart with no logged segments at all (an empty month, a
 * week that's all holiday), derived from the notification settings that come
 * closest to describing a "workday": quiet hours' end as the start of day, and
 * the end-of-day log-off time as its end. Each half falls back to the edge of
 * the full day independently when its setting is off, so e.g. quiet hours on
 * with end-of-day off still narrows the start.
 */
export function deriveFallbackHours(prefs: NotificationPreferences): HourDomain {
  const start = prefs.quietHours.enabled ? prefs.quietHours.endMinute / 60 : 0;
  const logoffMinutes = timeInputToMinutes(prefs.endOfDay.logoffTime);
  const end = prefs.endOfDay.enabled && logoffMinutes !== null ? logoffMinutes / 60 : 24;

  return end <= start ? FULL_DAY_DOMAIN : { start, end };
}

/** Never zoom in past this many hours, so a single short log doesn't produce an absurd axis. */
const MIN_DOMAIN_SPAN_HOURS = 6;

/** Padding added each side of the logged range, before clamping to `[0, 24]`. */
const DOMAIN_PAD_HOURS = 1;

/**
 * Derives the axis window from the hours actually logged across `days`, so the
 * chart doesn't waste half its width on a stretch of the day nobody works in.
 * One domain is shared by every row — that's what keeps days comparable against
 * each other. Falls back to `fallback` (typically the quiet-hours / log-off
 * window, or the full day) when nothing in `days` has a segment.
 */
export function computeHourDomain(days: SegmentedDay[], fallback: HourDomain): HourDomain {
  let min = Infinity;
  let max = -Infinity;

  for (const day of days) {
    for (const segment of day.segments) {
      const start = hourOfDay(segment.startAt);
      const end = start + segment.hours;
      if (start < min) min = start;
      if (end > max) max = end;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return fallback;
  }

  let start = Math.max(0, Math.floor(min) - DOMAIN_PAD_HOURS);
  let end = Math.min(24, Math.ceil(max) + DOMAIN_PAD_HOURS);

  if (end - start < MIN_DOMAIN_SPAN_HOURS) {
    const grow = (MIN_DOMAIN_SPAN_HOURS - (end - start)) / 2;
    start = Math.max(0, start - grow);
    end = Math.min(24, end + grow);
    // Either side may have been clamped against 0/24; give the room back to the other.
    if (end - start < MIN_DOMAIN_SPAN_HOURS) {
      start = Math.max(0, end - MIN_DOMAIN_SPAN_HOURS);
    }
    if (end - start < MIN_DOMAIN_SPAN_HOURS) {
      end = Math.min(24, start + MIN_DOMAIN_SPAN_HOURS);
    }
  }

  return { start, end };
}

/** Gridline step, always every 3h of the domain — thin lines never collide. */
const GRIDLINE_STEP_HOURS = 3;

/** Gridlines strictly inside the domain (endpoints are the track's own edges). */
export function gridlineHoursFor(domain: HourDomain): number[] {
  const hours: number[] = [];
  const first = Math.ceil(domain.start / GRIDLINE_STEP_HOURS) * GRIDLINE_STEP_HOURS;
  for (let hour = first; hour < domain.end; hour += GRIDLINE_STEP_HOURS) {
    if (hour > domain.start) hours.push(hour);
  }
  return hours;
}

/**
 * Candidate label spacings, densest first. A `12 AM`-style label is ~46px, and
 * with padding around it needs roughly 58px before adjacent labels start
 * touching; narrower tracks (or a narrower domain, which packs more labels
 * into the same step) step up to 6h then 12h then 24h rather than overprinting.
 */
const RULER_LABEL_PX = 58;
const RULER_STEP_CANDIDATES = [3, 6, 12, 24];

/** Step-aligned hours covering `domain`, always including both of its endpoints. */
function hoursForStep(domain: HourDomain, step: number): number[] {
  const hours: number[] = [];
  const first = Math.ceil(domain.start / step) * step;
  for (let hour = first; hour <= domain.end; hour += step) hours.push(hour);
  if (hours.length === 0 || hours[0] !== domain.start) hours.unshift(domain.start);
  if (hours[hours.length - 1] !== domain.end) hours.push(domain.end);
  return hours;
}

export function rulerHoursFor(domain: HourDomain, trackWidth: number): number[] {
  for (const step of RULER_STEP_CANDIDATES) {
    const hours = hoursForStep(domain, step);
    if (trackWidth > 0 && hours.length * RULER_LABEL_PX <= trackWidth) {
      return hours;
    }
  }
  return hoursForStep(domain, RULER_STEP_CANDIDATES[RULER_STEP_CANDIDATES.length - 1]);
}
