/**
 * Formatting for a work log's *runs* — the pause-separated stretches it was
 * actually running.
 *
 * A log paused at 11:30 and resumed at 12:20 did not run "11:00 to 13:30"; it
 * ran twice. Printing the outer span next to a duration that excludes the pause
 * makes the two contradict each other, so every surface that shows an entry's
 * timing shares this formatter.
 *
 * Kept free of React and of chart types so the chart tooltip, the day page, and
 * the CSV export can all import it.
 */

import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime } from "@/lib/time-format";

/** Minimal run shape: anything with a start and an optional end reads here. */
export interface FormattableRun {
  startAt: string;
  endAt?: string | null;
}

/** Placeholder for a time that cannot be read. */
const UNKNOWN = "?";

function safeTime(value: string | null | undefined, timeFormat: TimeFormat): string {
  if (!value) return UNKNOWN;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? UNKNOWN : formatTime(date, timeFormat);
}

/**
 * One run as `09:00 → 10:00`, or `09:00 → now` while it is still open.
 *
 * `openLabel` lets a surface say something other than "now" for an open run.
 */
export function formatRunRange(
  run: FormattableRun,
  timeFormat: TimeFormat,
  openLabel = "now",
): string {
  const start = safeTime(run.startAt, timeFormat);
  if (!run.endAt) {
    return `${start} → ${openLabel}`;
  }
  return `${start} → ${safeTime(run.endAt, timeFormat)}`;
}

/**
 * Every run, comma-separated: `09:00 → 10:00, 11:00 → 12:00`.
 *
 * Empty when there are no runs, so callers can fall back to whatever they knew
 * before runs were recorded.
 */
export function formatRunRanges(
  runs: readonly FormattableRun[] | null | undefined,
  timeFormat: TimeFormat,
  openLabel = "now",
): string {
  if (!runs?.length) {
    return "";
  }
  return runs.map((run) => formatRunRange(run, timeFormat, openLabel)).join(", ");
}
