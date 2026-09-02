/**
 * Data transforms that turn raw time entries into the segmented daily
 * activity shape consumed by the chart components.
 *
 * A "segment" is a single work log; a "day" is a stack of segments whose
 * heights sum to the day's total tracked hours.
 */

import { eachDayOfInterval, format } from "date-fns";

import { getSegmentVariantColor, resolveEntryColor } from "@/lib/charts/theme";
import { splitEntryAcrossDays, type EntryDaySlice } from "@/lib/time-tracking/day-slices";

/**
 * Derived lifecycle status for a work log. koku's `TimeEntry` has no explicit
 * status column, so status is inferred:
 *  - `running`   → no `endAt` (an in-flight timer merged into the view)
 *  - `paused`    → an in-flight timer whose clock is stopped. Only ever set
 *                  explicitly by the caller merging live timers in: a stored
 *                  `TimeEntry` has no way to express "paused".
 *  - `completed` → has `endAt` and tracked duration
 *  - `pending`   → has `endAt` but zero duration (logged but not worked)
 *  - `failed`    → reserved; surfaced when an entry is explicitly flagged
 */
export type WorkLogStatus = "completed" | "running" | "paused" | "pending" | "failed";

/** Whether a work log is tied to a project. */
export type AssignmentState = "assigned" | "unassigned";

/**
 * One uninterrupted stretch of work inside a log.
 *
 * A log that was paused and resumed is not one continuous block on the clock:
 * it is the runs between its pauses, and the gaps belong to whatever else was
 * happening (typically the parallel task that was started while it was paused).
 * `endAt` is `null` only for the still-open run of a live timer.
 */
export interface SegmentRun {
  startAt: string;
  endAt: string | null;
  durationSec: number;
}

/** A single work-log segment within a stacked day column. */
export interface WorkLogSegment {
  /** Unique within the chart. Suffixed with the day for entries split at midnight. */
  id: string;
  /** The `TimeEntry` this segment came from — stable across day slices, unlike `id`. */
  entryId: string;
  title: string;
  description: string | null;
  projectId: string | null;
  projectName: string;
  categoryName: string | null;
  color: string;
  startAt: string;
  endAt: string | null;
  durationSec: number;
  hours: number;
  tags: string[];
  status: WorkLogStatus;
  assignment: AssignmentState;
  /** True when the entry crosses midnight, so this is one day's slice of it. */
  isPartial: boolean;
  /** The entry started before this day. */
  continuedFromPreviousDay: boolean;
  /** The entry runs past the end of this day. */
  continuesNextDay: boolean;
  /**
   * The worked stretches of this segment, clipped to its day. `buildSegmentedDays`
   * always fills it — a log that was never paused gets one run covering the whole
   * segment. Optional only for hand-built days (the deprecated `DailyBarChart`
   * shim), which consumers fall back to `startAt`/`durationSec` for.
   */
  runs?: SegmentRun[];
}

/**
 * Why a day carried no work.
 *
 * `holiday` comes from the explicit `holidayDates` list, `weekend` from the
 * recurring week-off weekdays. A day can be both on paper; the explicit
 * one-off wins because it is the more specific statement about that date.
 */
export type NonWorkingKind = "holiday" | "weekend";

/** A non-working day's marker, rendered in place of an empty track. */
export interface NonWorkingMarker {
  kind: NonWorkingKind;
  /** Display text, e.g. `Holiday` or `Weekend`. */
  label: string;
}

/** One day's worth of segments, ready for a stacked bar column. */
export interface SegmentedDay {
  /** Machine key, e.g. `2024-06-03`. */
  key: string;
  /** Human label rendered on the axis, e.g. `Mon` or `Jun 3`. */
  label: string;
  totalSeconds: number;
  totalHours: number;
  segments: WorkLogSegment[];
  /** Convenience flag so the chart can add a live indicator to the column. */
  hasRunning: boolean;
  /** A live timer sits on this day with its clock stopped. */
  hasPaused: boolean;
  /**
   * Set when the day is a holiday or a week-off day. Independent of
   * `segments`: work logged on a holiday still counts, the day is just also
   * labelled as one.
   */
  nonWorking: NonWorkingMarker | null;
}

/** Minimal entry shape required to build segments (subset of `TimeEntry`). */
export interface SegmentSourceEntry {
  id: string;
  title: string;
  notes?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
  tags: string[];
  /** Explicit status override. When omitted, status is derived from the entry. */
  status?: WorkLogStatus;
  /**
   * Recorded pause-separated work runs, as written by `buildEntryFromTimer`.
   * When absent, the entry is treated as one continuous run. A `null` `endAt`
   * marks the open run of a live timer.
   */
  segments?: Array<{ startAt: string; endAt?: string | null }> | null;
}

export interface ProjectLookup {
  get(id: string): { id: string; name: string; color: string } | undefined;
}

export interface CategoryLookup {
  get(id: string): { id: string; name: string } | undefined;
}

export interface BuildSegmentsOptions {
  entries: SegmentSourceEntry[];
  projectMap: ProjectLookup;
  categoryMap?: CategoryLookup;
  /** Inclusive interval to bucket into. When omitted, buckets are derived from the entries themselves. */
  interval?: { start: Date; end: Date };
  /** Axis label format: `weekday` → `Mon`, `date` → `Jun 3`. Defaults to `date`. */
  labelFormat?: "weekday" | "date";
  /**
   * Entries carrying any of these tags are left out entirely — not just hidden,
   * but excluded from `totalSeconds` too.
   *
   * Exists for breaks: a break is written as a real `TimeEntry` so it shows in
   * the log and can be audited, but `deriveStatus` would otherwise class it as
   * ordinary completed work and it would inflate every work total. Defaults to
   * excluding nothing, so existing callers are unaffected.
   */
  excludeTags?: string[];
  /**
   * Local calendar days (`yyyy-MM-dd`) marked as holidays — the
   * `notifications.holidayDates` setting. Days in this list carry a `holiday`
   * marker so the chart can label them instead of drawing a bare empty track.
   */
  holidayDates?: readonly string[];
  /**
   * Weekday indices treated as recurring days off (0 = Sunday … 6 = Saturday),
   * i.e. the `notifications.silentDays` setting. Labelled `weekend`.
   */
  weekendDays?: readonly number[];
  /** Marker copy, overridable for wording that differs per surface. */
  holidayLabel?: string;
  weekendLabel?: string;
}

/** Whether an entry carries any of the excluded tags (case-insensitive). */
export function hasExcludedTag(entry: SegmentSourceEntry, excludeTags: string[]): boolean {
  if (excludeTags.length === 0) {
    return false;
  }

  const excluded = excludeTags.map((tag) => tag.trim().toLowerCase());
  return (entry.tags ?? []).some((tag) => excluded.includes(tag.trim().toLowerCase()));
}

/** Derives lifecycle status from an entry when not explicitly provided. */
export function deriveStatus(entry: SegmentSourceEntry): WorkLogStatus {
  if (entry.status) {
    return entry.status;
  }
  if (!entry.endAt) {
    return "running";
  }
  return (entry.durationSec ?? 0) > 0 ? "completed" : "pending";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseMs(value?: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The worked runs of an entry, clipped to the local day a slice belongs to.
 *
 * Clipping is to the *day*, not to the slice's own start/end: a slice's end is
 * derived from the entry's recorded duration, which for a paused-and-resumed
 * log falls short of where its later runs actually sit on the clock. Clipping to
 * the slice would drop exactly the runs this exists to draw.
 *
 * Falls back to a single run covering the slice when the entry recorded none —
 * every entry written before pause runs were stored, and every manual entry.
 */
function buildRuns(entry: SegmentSourceEntry, slice: EntryDaySlice): SegmentRun[] {
  const fallback: SegmentRun[] = [
    { startAt: slice.startAt, endAt: slice.endAt, durationSec: slice.durationSec },
  ];

  const recorded = entry.segments ?? [];
  if (recorded.length === 0) {
    return fallback;
  }

  const dayStartMs = slice.dayStart.getTime();
  const dayEndMs = dayStartMs + DAY_MS;
  const runs: SegmentRun[] = [];

  for (const run of recorded) {
    const startMs = parseMs(run.startAt);
    if (startMs === null) {
      continue;
    }
    const rawEndMs = parseMs(run.endAt);
    const openEnded = rawEndMs === null;
    const endMs = rawEndMs ?? dayEndMs;
    if (endMs <= dayStartMs || startMs >= dayEndMs) {
      continue;
    }

    const clippedStart = Math.max(startMs, dayStartMs);
    const clippedEnd = Math.min(endMs, dayEndMs);
    runs.push({
      startAt: new Date(clippedStart).toISOString(),
      // An open run stays open only while it is still inside this day; once it
      // has crossed midnight, this day's share of it really did end at midnight.
      endAt: openEnded && clippedEnd >= dayEndMs ? null : new Date(clippedEnd).toISOString(),
      durationSec: Math.max(0, Math.round((clippedEnd - clippedStart) / 1000)),
    });
  }

  return runs.length > 0 ? runs.sort((a, b) => a.startAt.localeCompare(b.startAt)) : fallback;
}

function toSegment(
  entry: SegmentSourceEntry,
  projectMap: ProjectLookup,
  categoryMap: CategoryLookup | undefined,
  slice: EntryDaySlice,
): WorkLogSegment {
  const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
  const categoryName =
    categoryMap && entry.categoryId ? categoryMap.get(entry.categoryId)?.name ?? null : null;
  const durationSec = Math.max(0, slice.durationSec);
  const isPartial = !(slice.isFirst && slice.isLast);
  // Only the day a live timer is currently in is still running; the days it has
  // already crossed are finished work with a real end time.
  const status: WorkLogStatus = (() => {
    const base = deriveStatus(entry);
    if ((base !== "running" && base !== "paused") || slice.isLast) {
      return base;
    }
    return durationSec > 0 ? "completed" : "pending";
  })();

  return {
    id: isPartial ? `${entry.id}::${slice.dayKey}` : entry.id,
    entryId: entry.id,
    title: entry.title,
    description: entry.notes ?? null,
    projectId: entry.projectId ?? null,
    projectName: project?.name ?? "Unassigned",
    categoryName,
    color: resolveEntryColor({ projectColor: project?.color, projectId: entry.projectId }),
    startAt: slice.startAt,
    endAt: slice.endAt,
    durationSec,
    // Running logs have no committed duration yet; give them a minimum visible
    // height so their live segment is always distinguishable in the stack.
    hours: Number(
      (Math.max(durationSec, status === "running" || status === "paused" ? 900 : 0) / 3600).toFixed(4),
    ),
    tags: entry.tags ?? [],
    status,
    assignment: entry.projectId ? "assigned" : "unassigned",
    isPartial,
    continuedFromPreviousDay: !slice.isFirst,
    continuesNextDay: !slice.isLast,
    runs: buildRuns(entry, slice),
  };
}

/**
 * Buckets entries into ordered days, each carrying its ordered work-log
 * segments. Days with no entries are still emitted when an `interval` is
 * supplied, so the axis stays continuous.
 *
 * Entries crossing midnight are split, so an `interval` also *clips*: the part of
 * a log that falls outside the window is left out rather than tacked onto a day
 * beyond the axis. Callers wanting the leading edge of a boundary-crossing log
 * must fetch a little before `interval.start`.
 */
export function buildSegmentedDays({
  entries,
  projectMap,
  categoryMap,
  interval,
  labelFormat = "date",
  excludeTags = [],
  holidayDates = [],
  weekendDays = [],
  holidayLabel = "Holiday",
  weekendLabel = "Weekend",
}: BuildSegmentsOptions): SegmentedDay[] {
  const labelFor = (date: Date) =>
    labelFormat === "weekday" ? format(date, "EEE") : format(date, "MMM d");

  const holidaySet = new Set(holidayDates);
  const weekendSet = new Set(weekendDays);

  const nonWorkingFor = (date: Date, key: string): NonWorkingMarker | null => {
    if (holidaySet.has(key)) {
      return { kind: "holiday", label: holidayLabel };
    }
    if (weekendSet.has(date.getDay())) {
      return { kind: "weekend", label: weekendLabel };
    }
    return null;
  };

  const dayMap = new Map<string, SegmentedDay>();

  const ensureDay = (date: Date): SegmentedDay => {
    const key = format(date, "yyyy-MM-dd");
    let day = dayMap.get(key);
    if (!day) {
      day = {
        key,
        label: labelFor(date),
        totalSeconds: 0,
        totalHours: 0,
        segments: [],
        hasRunning: false,
        hasPaused: false,
        nonWorking: nonWorkingFor(date, key),
      };
      dayMap.set(key, day);
    }
    return day;
  };

  const intervalKeys = interval
    ? new Set(eachDayOfInterval(interval).map((date) => format(date, "yyyy-MM-dd")))
    : null;

  if (interval) {
    for (const date of eachDayOfInterval(interval)) {
      ensureDay(date);
    }
  }

  // Sort ascending by start so segments stack chronologically (earliest first).
  const sorted = [...entries]
    .filter((entry) => !hasExcludedTag(entry, excludeTags))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  for (const entry of sorted) {
    // An entry that crosses midnight lands on every day it covers, each day
    // holding only the seconds worked in it.
    for (const slice of splitEntryAcrossDays(entry)) {
      if (intervalKeys && !intervalKeys.has(slice.dayKey)) {
        continue;
      }
      const day = ensureDay(slice.dayStart);
      const segment = toSegment(entry, projectMap, categoryMap, slice);
      day.segments.push(segment);
      day.totalSeconds += segment.durationSec;
      if (segment.status === "running") {
        day.hasRunning = true;
      } else if (segment.status === "paused") {
        day.hasPaused = true;
      }
    }
  }

  const days = Array.from(dayMap.values());
  for (const day of days) {
    const colorCounts = day.segments.reduce((counts, segment) => {
      counts.set(segment.color, (counts.get(segment.color) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    day.segments = day.segments.map((segment) =>
      (colorCounts.get(segment.color) ?? 0) > 1
        ? {
            ...segment,
            color: getSegmentVariantColor(segment.color, `${day.key}-${segment.id}`),
          }
        : segment,
    );
    day.totalHours = Number((day.totalSeconds / 3600).toFixed(2));
  }

  return days.sort((a, b) => a.key.localeCompare(b.key));
}

/** Aggregates segmented days into a per-project breakdown for pie charts. */
export function toProjectBreakdown(days: SegmentedDay[]): Array<{
  key: string;
  name: string;
  hours: number;
  seconds: number;
  color: string;
}> {
  const map = new Map<string, { key: string; name: string; seconds: number; color: string }>();
  for (const day of days) {
    for (const segment of day.segments) {
      const key = segment.projectId ?? "unassigned";
      const existing = map.get(key) ?? {
        key,
        name: segment.projectName,
        seconds: 0,
        color: segment.color,
      };
      existing.seconds += segment.durationSec;
      map.set(key, existing);
    }
  }
  return Array.from(map.values())
    .map((item) => ({ ...item, hours: Number((item.seconds / 3600).toFixed(2)) }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** A slice of the status/assignment distribution pie. */
export interface StatusSlice {
  key: string;
  name: string;
  color: string;
  count: number;
  seconds: number;
  hours: number;
}

/**
 * Aggregates segments into a combined status + assignment distribution for the
 * reports pie chart. Produces slices for Completed / Running / Paused / Pending /
 * Failed
 * plus Assigned / Unassigned, each keyed to the shared status palette so colours
 * and legends stay consistent across the app.
 */
export function toStatusBreakdown(
  days: SegmentedDay[],
  colorFor: (key: string) => string,
): { status: StatusSlice[]; assignment: StatusSlice[] } {
  const statusOrder: WorkLogStatus[] = ["completed", "running", "paused", "pending", "failed"];
  const statusLabel: Record<WorkLogStatus, string> = {
    completed: "Completed",
    running: "Running",
    paused: "Paused",
    pending: "Pending",
    failed: "Failed",
  };

  const statusAgg = new Map<WorkLogStatus, { count: number; seconds: number }>();
  const assignmentAgg = new Map<AssignmentState, { count: number; seconds: number }>();

  for (const day of days) {
    for (const segment of day.segments) {
      const s = statusAgg.get(segment.status) ?? { count: 0, seconds: 0 };
      s.count += 1;
      s.seconds += segment.durationSec;
      statusAgg.set(segment.status, s);

      const a = assignmentAgg.get(segment.assignment) ?? { count: 0, seconds: 0 };
      a.count += 1;
      a.seconds += segment.durationSec;
      assignmentAgg.set(segment.assignment, a);
    }
  }

  const status: StatusSlice[] = statusOrder
    .filter((key) => statusAgg.has(key))
    .map((key) => {
      const agg = statusAgg.get(key)!;
      return {
        key,
        name: statusLabel[key],
        color: colorFor(key),
        count: agg.count,
        seconds: agg.seconds,
        hours: Number((agg.seconds / 3600).toFixed(2)),
      };
    });

  const assignment: StatusSlice[] = (["assigned", "unassigned"] as AssignmentState[])
    .filter((key) => assignmentAgg.has(key))
    .map((key) => {
      const agg = assignmentAgg.get(key)!;
      return {
        key,
        name: key === "assigned" ? "Assigned" : "Unassigned",
        color: colorFor(key),
        count: agg.count,
        seconds: agg.seconds,
        hours: Number((agg.seconds / 3600).toFixed(2)),
      };
    });

  return { status, assignment };
}
