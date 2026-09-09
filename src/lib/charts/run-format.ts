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

/** Stand-in time for an event that has not happened yet. */
const OPEN_TIME = "now";

/** Whole seconds between two timestamps, or `undefined` if either is unusable. */
function spanSec(from: string | null | undefined, to: string | null | undefined): number | undefined {
  if (!from || !to) return undefined;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : undefined;
}

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

/** What happened at one point in a run's life. Drives the log's icon/colour. */
export type RunLogEventKind = "start" | "pause" | "resume" | "stop" | "open";

/** One line in a run's event log: `[9:45 am] Started`. */
export interface RunLogEvent {
  kind: RunLogEventKind;
  label: string;
  time: string;
  /**
   * Seconds the line closes off, for surfaces that annotate it: the run that
   * just ended on a pause/stop, and the break that just ended on a resume.
   * Absent on the first start and on an open run.
   */
  spanSec?: number;
}

/**
 * Every run expanded into Started/Paused/Resumed/Stopped events, in order:
 * a run paused once and resumed reads as Started, Paused, Resumed, Stopped
 * instead of a single outer range that hides the pause.
 *
 * The final run's end is labeled `stoppedLabel`; every other run's end is a
 * pause. A still-open final run has no end to print, so it closes on
 * `openLabel` at the same `"now"` the range formatters use — without it a
 * running entry would read as a lone "Started" and look truncated.
 */
export function formatRunLog(
  runs: readonly FormattableRun[] | null | undefined,
  timeFormat: TimeFormat,
  stoppedLabel = "Stopped",
  openLabel = "Running",
): RunLogEvent[] {
  if (!runs?.length) {
    return [];
  }
  const events: RunLogEvent[] = [];
  runs.forEach((run, index) => {
    const isLastRun = index === runs.length - 1;
    const previousEnd = index > 0 ? runs[index - 1].endAt : null;
    events.push({
      kind: index === 0 ? "start" : "resume",
      label: index === 0 ? "Started" : "Resumed",
      time: safeTime(run.startAt, timeFormat),
      spanSec: index === 0 ? undefined : spanSec(previousEnd, run.startAt),
    });
    if (run.endAt) {
      events.push({
        kind: isLastRun ? "stop" : "pause",
        label: isLastRun ? stoppedLabel : "Paused",
        time: safeTime(run.endAt, timeFormat),
        spanSec: spanSec(run.startAt, run.endAt),
      });
    } else if (isLastRun) {
      events.push({ kind: "open", label: openLabel, time: OPEN_TIME });
    }
  });
  return events;
}
