import { addDays, format, startOfDay } from "date-fns";

/**
 * Splitting a time entry at local midnight.
 *
 * A timer that is never stopped produces one entry whose duration can exceed a
 * day. Attributing all of it to the day it *started* is what made a Friday
 * column read "39 h" — more hours than the day contains. Every aggregation
 * (day totals, weekly stacks, project breakdowns) therefore buckets an entry by
 * the slices it actually occupies, not by `startAt` alone.
 *
 * Pure and `now`-free: an open-ended entry's end is derived from its recorded
 * duration (`startAt + durationSec`), which for a live timer is already the
 * elapsed time. Passing a clock in here would make every chart depend on render
 * timing.
 */

/** Minimal entry shape needed to slice by day. */
export interface DaySliceSourceEntry {
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
}

export interface EntryDaySlice {
  /** Local calendar day, e.g. `2024-06-07`. */
  dayKey: string;
  /** Start of the local day this slice belongs to. */
  dayStart: Date;
  /** Slice start, clipped to the day. */
  startAt: string;
  /** Slice end, clipped to the day. `null` only on the last slice of an open-ended entry. */
  endAt: string | null;
  /** Tracked seconds attributed to this day. Slices sum to the entry's duration. */
  durationSec: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Guard against a corrupt entry (a bad timestamp, a duration of years) turning
 * one row into an unbounded loop. Beyond this the tail is lumped into the last
 * slice rather than silently dropped.
 */
const MAX_SLICES = 400;

function parseMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toSlice(
  dayStart: Date,
  startMs: number,
  endMs: number,
  durationSec: number,
  isFirst: boolean,
  isLast: boolean,
  openEnded: boolean,
): EntryDaySlice {
  return {
    dayKey: format(dayStart, "yyyy-MM-dd"),
    dayStart,
    startAt: new Date(startMs).toISOString(),
    endAt: isLast && openEnded ? null : new Date(endMs).toISOString(),
    durationSec,
    isFirst,
    isLast,
  };
}

/** The entry's tracked seconds, from `durationSec` when present or the span otherwise. */
export function getEntryDurationSec(entry: DaySliceSourceEntry): number {
  const recorded = entry.durationSec ?? null;
  if (recorded !== null && Number.isFinite(recorded)) {
    return Math.max(0, Math.floor(recorded));
  }

  const startMs = parseMs(entry.startAt);
  const endMs = parseMs(entry.endAt);
  if (startMs === null || endMs === null) {
    return 0;
  }
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

/**
 * Splits an entry into one slice per local calendar day it covers.
 *
 * Tracked seconds are distributed by each day's share of the wall-clock span, so
 * an entry whose duration is shorter than its span (a paused timer) keeps its
 * recorded total instead of being inflated back to the span. The last slice
 * absorbs the rounding remainder, which is what keeps the slices summing to the
 * entry's duration exactly.
 *
 * Returns a single slice for anything that cannot span a boundary: an unparseable
 * start, a zero/negative span, or a zero duration.
 */
export function splitEntryAcrossDays(entry: DaySliceSourceEntry): EntryDaySlice[] {
  const startMs = parseMs(entry.startAt);
  if (startMs === null) {
    return [];
  }

  const totalSec = getEntryDurationSec(entry);
  const explicitEndMs = parseMs(entry.endAt);
  const openEnded = explicitEndMs === null;
  const endMs = explicitEndMs ?? startMs + totalSec * 1000;
  const spanMs = endMs - startMs;

  const dayStart = startOfDay(new Date(startMs));
  const single = () => [toSlice(dayStart, startMs, endMs, totalSec, true, true, openEnded)];

  if (spanMs <= 0 || totalSec === 0) {
    return single();
  }

  // Collect the day boundaries first so allocation knows which slice is last.
  const spans: Array<{ dayStart: Date; startMs: number; endMs: number }> = [];
  let cursorDay = dayStart;
  while (cursorDay.getTime() < endMs && spans.length < MAX_SLICES) {
    const nextDay = addDays(cursorDay, 1);
    spans.push({
      dayStart: cursorDay,
      startMs: Math.max(startMs, cursorDay.getTime()),
      endMs: Math.min(endMs, nextDay.getTime()),
    });
    cursorDay = nextDay;
  }

  if (spans.length <= 1) {
    return single();
  }

  // A truncated walk must not lose time: stretch the final slice to the real end.
  spans[spans.length - 1].endMs = endMs;

  let allocated = 0;
  return spans.map((span, index) => {
    const isLast = index === spans.length - 1;
    const share = isLast
      ? totalSec - allocated
      : Math.floor((totalSec * (span.endMs - span.startMs)) / spanMs);
    allocated += share;

    return toSlice(
      span.dayStart,
      span.startMs,
      span.endMs,
      Math.max(0, share),
      index === 0,
      isLast,
      openEnded,
    );
  });
}

/**
 * How far before a window to start querying entries.
 *
 * Entries are indexed by `startAt`, so a log that began before the window but
 * runs into it is invisible to a `startAt`-bounded query. Reaching back a couple
 * of weeks covers a timer left running over a holiday without scanning the whole
 * table; anything longer is lost to the window, not miscounted in it.
 */
export const CROSS_DAY_LOOKBACK_DAYS = 14;

/** Start of the query window for `windowStart`, widened for boundary-crossing logs. */
export function getLookbackStart(windowStart: Date): Date {
  return addDays(startOfDay(windowStart), -CROSS_DAY_LOOKBACK_DAYS);
}

/** Seconds of an entry worked on a given local day (`yyyy-MM-dd`). */
export function getEntrySecondsOnDay(entry: DaySliceSourceEntry, dayKey: string): number {
  return splitEntryAcrossDays(entry)
    .filter((slice) => slice.dayKey === dayKey)
    .reduce((sum, slice) => sum + slice.durationSec, 0);
}

/** Whether any part of an entry falls on a given local day. */
export function entryTouchesDay(entry: DaySliceSourceEntry, dayKey: string): boolean {
  return splitEntryAcrossDays(entry).some((slice) => slice.dayKey === dayKey);
}

/** Seconds of an entry worked on any of the given local days. */
export function getEntrySecondsInDays(entry: DaySliceSourceEntry, dayKeys: Set<string>): number {
  return splitEntryAcrossDays(entry)
    .filter((slice) => dayKeys.has(slice.dayKey))
    .reduce((sum, slice) => sum + slice.durationSec, 0);
}
