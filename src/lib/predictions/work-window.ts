/**
 * Predicts when someone is likely to log on and off, per weekday, from
 * their own tracked history. Generalizes the median-of-daily-extremes
 * approach in `@/lib/notifications/adaptive-quiet-hours` (which derives a
 * single quiet-hours window) into seven independent predictions, one per
 * weekday, since a Tuesday and a Saturday rarely share a shape.
 *
 * Purely statistical: no AI call, so it works with zero AI connections
 * configured, and it is pure and deterministic (`entries`/`now` are
 * injected) so it is unit-testable without touching Dexie or the clock.
 */

import { format, getDay } from "date-fns";

import { hasExcludedTag, type SegmentSourceEntry } from "@/lib/charts/segments";
import { hourOfDay } from "@/lib/charts/hour-domain";
import { BREAK_TAG } from "@/lib/notifications/settings";

/** How far back to look for a pattern. */
const LOOKBACK_DAYS = 56;

/** Fewer occurrences of a weekday than this and there isn't enough signal for it. */
const MIN_SAMPLES = 3;

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface WorkWindowPrediction {
  weekday: number;
  weekdayLabel: (typeof WEEKDAY_LABELS)[number];
  /** Hour of day (0-24, fractional) the day's first tracked activity tends to start. */
  loginHour: number;
  /** Hour of day (0-24, fractional) the day's last tracked activity tends to end. */
  logoffHour: number;
  /** How many distinct days of history this weekday's prediction is built from. */
  sampleCount: number;
  /** sampleCount / (LOOKBACK_DAYS / 7), clamped to [0, 1]. Rough confidence signal for the UI. */
  confidence: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Predicts login/logoff hours per weekday from `entries`. Returns one entry
 * per weekday that has at least `MIN_SAMPLES` days of history; a weekday
 * with too little signal (e.g. a role with no weekend work) is simply
 * omitted rather than guessed at.
 */
export function predictWorkWindows(entries: SegmentSourceEntry[], now: Date = new Date()): WorkWindowPrediction[] {
  const cutoff = now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const byDay = new Map<string, { weekday: number; starts: number[]; ends: number[] }>();
  for (const entry of entries) {
    if (hasExcludedTag(entry, [BREAK_TAG])) continue;
    const startedAt = new Date(entry.startAt);
    if (Number.isNaN(startedAt.getTime()) || startedAt.getTime() < cutoff) continue;

    const dayKey = format(startedAt, "yyyy-MM-dd");
    const start = hourOfDay(entry.startAt);
    const durationHours = (entry.durationSec ?? 0) / 3600;
    const end = start + durationHours;

    const bucket = byDay.get(dayKey) ?? { weekday: getDay(startedAt), starts: [], ends: [] };
    bucket.starts.push(start);
    bucket.ends.push(end);
    byDay.set(dayKey, bucket);
  }

  const byWeekday = new Map<number, { starts: number[]; ends: number[]; days: number }>();
  for (const bucket of byDay.values()) {
    const slot = byWeekday.get(bucket.weekday) ?? { starts: [], ends: [], days: 0 };
    slot.starts.push(Math.min(...bucket.starts));
    slot.ends.push(Math.max(...bucket.ends));
    slot.days += 1;
    byWeekday.set(bucket.weekday, slot);
  }

  const expectedSamples = LOOKBACK_DAYS / 7;
  const predictions: WorkWindowPrediction[] = [];

  for (const [weekday, slot] of byWeekday.entries()) {
    if (slot.days < MIN_SAMPLES) continue;

    predictions.push({
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      loginHour: median(slot.starts),
      logoffHour: median(slot.ends),
      sampleCount: slot.days,
      confidence: Math.min(1, slot.days / expectedSamples),
    });
  }

  return predictions.sort((a, b) => a.weekday - b.weekday);
}

/** Renders a fractional hour (e.g. 9.5) as "9:30 AM" for display. */
export function formatPredictedHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const wholeHour = Math.floor(normalized);
  const minutes = Math.round((normalized - wholeHour) * 60);
  const date = new Date(2000, 0, 1, wholeHour, minutes);
  return format(date, "h:mm a");
}
