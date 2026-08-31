/**
 * Derives a quiet-hours window from recently logged activity, so the setting
 * can track how someone actually works instead of sitting at its 22:00–08:00
 * default forever. Pure — callers inject `entries` and `now` so this stays
 * testable without touching Dexie or the clock.
 */

import { format } from "date-fns";

import { hasExcludedTag, type SegmentSourceEntry } from "@/lib/charts/segments";
import { hourOfDay } from "@/lib/charts/hour-domain";
import { BREAK_TAG } from "@/lib/notifications/settings";

/** How far back to look for a work-hours pattern. */
const LOOKBACK_DAYS = 30;

/** Fewer days than this and there isn't enough signal to derive anything. */
const MIN_DAYS_WITH_LOGS = 5;

/** Buffer kept between the working window and quiet hours. */
const BUFFER_MINUTES = 60;

/** Proposed times are rounded to the nearest quarter hour — matches the UI's granularity. */
const ROUND_MINUTES = 15;

const MINUTES_IN_DAY = 24 * 60;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function roundToNearest(minutes: number, step: number): number {
  return (((Math.round(minutes / step) * step) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

/** Shorter of the two arcs between two clock times, in minutes. */
function circularDistanceMinutes(a: number, b: number): number {
  const diff = Math.abs(a - b) % MINUTES_IN_DAY;
  return Math.min(diff, MINUTES_IN_DAY - diff);
}

export interface QuietHoursWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * Returns a new quiet-hours window derived from `entries`, or `null` when
 * there isn't enough signal to propose one, or the proposal is close enough
 * to `current` that changing it would just be churn.
 */
export function deriveQuietHours(
  entries: SegmentSourceEntry[],
  current: QuietHoursWindow,
  now: Date = new Date(),
): QuietHoursWindow | null {
  const cutoff = now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const byDay = new Map<string, { starts: number[]; ends: number[] }>();
  for (const entry of entries) {
    if (hasExcludedTag(entry, [BREAK_TAG])) continue;
    const startedAt = new Date(entry.startAt);
    if (Number.isNaN(startedAt.getTime()) || startedAt.getTime() < cutoff) continue;

    const dayKey = format(startedAt, "yyyy-MM-dd");
    const start = hourOfDay(entry.startAt);
    const durationHours = (entry.durationSec ?? 0) / 3600;
    const end = start + durationHours;

    const bucket = byDay.get(dayKey) ?? { starts: [], ends: [] };
    bucket.starts.push(start);
    bucket.ends.push(end);
    byDay.set(dayKey, bucket);
  }

  if (byDay.size < MIN_DAYS_WITH_LOGS) {
    return null;
  }

  const dailyStarts: number[] = [];
  const dailyEnds: number[] = [];
  for (const bucket of byDay.values()) {
    dailyStarts.push(Math.min(...bucket.starts));
    dailyEnds.push(Math.max(...bucket.ends));
  }

  // Median, not mean, so one all-nighter or one early start doesn't drag the
  // whole window toward it.
  const medianStartHour = median(dailyStarts);
  const medianEndHour = median(dailyEnds);

  const proposed: QuietHoursWindow = {
    startMinute: roundToNearest(medianEndHour * 60 + BUFFER_MINUTES, ROUND_MINUTES),
    endMinute: roundToNearest(medianStartHour * 60 - BUFFER_MINUTES, ROUND_MINUTES),
  };

  const changedEnough =
    circularDistanceMinutes(proposed.startMinute, current.startMinute) >= 30 ||
    circularDistanceMinutes(proposed.endMinute, current.endMinute) >= 30;

  return changedEnough ? proposed : null;
}
