/**
 * Data transforms that turn raw time entries into the segmented daily
 * activity shape consumed by the chart components.
 *
 * A "segment" is a single work log; a "day" is a stack of segments whose
 * heights sum to the day's total tracked hours.
 */

import { eachDayOfInterval, format } from "date-fns";

import { resolveEntryColor } from "@/lib/charts/theme";

/**
 * Derived lifecycle status for a work log. koku's `TimeEntry` has no explicit
 * status column, so status is inferred:
 *  - `running`   → no `endAt` (an in-flight timer merged into the view)
 *  - `completed` → has `endAt` and tracked duration
 *  - `pending`   → has `endAt` but zero duration (logged but not worked)
 *  - `failed`    → reserved; surfaced when an entry is explicitly flagged
 */
export type WorkLogStatus = "completed" | "running" | "pending" | "failed";

/** Whether a work log is tied to a project. */
export type AssignmentState = "assigned" | "unassigned";

/** A single work-log segment within a stacked day column. */
export interface WorkLogSegment {
  id: string;
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
}

export interface ProjectLookup {
  get(id: string): { id: string; name: string; color: string } | undefined;
}

export interface CategoryLookup {
  get(id: string): { id: string; name: string } | undefined;
}

interface BuildSegmentsOptions {
  entries: SegmentSourceEntry[];
  projectMap: ProjectLookup;
  categoryMap?: CategoryLookup;
  /** Inclusive interval to bucket into. When omitted, buckets are derived from the entries themselves. */
  interval?: { start: Date; end: Date };
  /** Axis label format: `weekday` → `Mon`, `date` → `Jun 3`. Defaults to `date`. */
  labelFormat?: "weekday" | "date";
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

function toSegment(
  entry: SegmentSourceEntry,
  projectMap: ProjectLookup,
  categoryMap?: CategoryLookup,
): WorkLogSegment {
  const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
  const categoryName =
    categoryMap && entry.categoryId ? categoryMap.get(entry.categoryId)?.name ?? null : null;
  const durationSec = Math.max(0, entry.durationSec ?? 0);
  const status = deriveStatus(entry);

  return {
    id: entry.id,
    title: entry.title,
    description: entry.notes ?? null,
    projectId: entry.projectId ?? null,
    projectName: project?.name ?? "Unassigned",
    categoryName,
    color: resolveEntryColor({ projectColor: project?.color, projectId: entry.projectId }),
    startAt: entry.startAt,
    endAt: entry.endAt ?? null,
    durationSec,
    // Running logs have no committed duration yet; give them a minimum visible
    // height so their live segment is always distinguishable in the stack.
    hours: Number((Math.max(durationSec, status === "running" ? 900 : 0) / 3600).toFixed(4)),
    tags: entry.tags ?? [],
    status,
    assignment: entry.projectId ? "assigned" : "unassigned",
  };
}

/**
 * Buckets entries into ordered days, each carrying its ordered work-log
 * segments. Days with no entries are still emitted when an `interval` is
 * supplied, so the axis stays continuous.
 */
export function buildSegmentedDays({
  entries,
  projectMap,
  categoryMap,
  interval,
  labelFormat = "date",
}: BuildSegmentsOptions): SegmentedDay[] {
  const labelFor = (date: Date) =>
    labelFormat === "weekday" ? format(date, "EEE") : format(date, "MMM d");

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
      };
      dayMap.set(key, day);
    }
    return day;
  };

  if (interval) {
    for (const date of eachDayOfInterval(interval)) {
      ensureDay(date);
    }
  }

  // Sort ascending by start so segments stack chronologically (earliest first).
  const sorted = [...entries].sort((a, b) => a.startAt.localeCompare(b.startAt));

  for (const entry of sorted) {
    const date = new Date(entry.startAt);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const day = ensureDay(date);
    const segment = toSegment(entry, projectMap, categoryMap);
    day.segments.push(segment);
    day.totalSeconds += segment.durationSec;
    if (segment.status === "running") {
      day.hasRunning = true;
    }
  }

  const days = Array.from(dayMap.values());
  for (const day of days) {
    day.totalHours = Number((day.totalSeconds / 3600).toFixed(2));
  }

  return days.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Flattens segmented days into the row shape Recharts needs for a stacked
 * `<BarChart>`: one object per day with a numeric key per segment index plus a
 * parallel `segments` array for tooltip lookups.
 */
export interface StackedRow {
  key: string;
  label: string;
  totalHours: number;
  segments: WorkLogSegment[];
  hasRunning: boolean;
  /** Index of the topmost segment for this day, so only it gets rounded corners. `-1` when empty. */
  topSegmentIndex: number;
  /** `seg0`, `seg1`, … hold each segment's hours for the stacked bars. */
  [segKey: string]: number | string | boolean | WorkLogSegment[];
}

export function toStackedRows(days: SegmentedDay[]): {
  rows: StackedRow[];
  maxSegments: number;
} {
  let maxSegments = 0;
  const rows: StackedRow[] = days.map((day) => {
    maxSegments = Math.max(maxSegments, day.segments.length);
    const row: StackedRow = {
      key: day.key,
      label: day.label,
      totalHours: day.totalHours,
      segments: day.segments,
      hasRunning: day.hasRunning,
      topSegmentIndex: day.segments.length - 1,
    };
    day.segments.forEach((segment, index) => {
      row[`seg${index}`] = segment.hours;
    });
    return row;
  });

  return { rows, maxSegments };
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
 * reports pie chart. Produces slices for Completed / Running / Pending / Failed
 * plus Assigned / Unassigned, each keyed to the shared status palette so colours
 * and legends stay consistent across the app.
 */
export function toStatusBreakdown(
  days: SegmentedDay[],
  colorFor: (key: string) => string,
): { status: StatusSlice[]; assignment: StatusSlice[] } {
  const statusOrder: WorkLogStatus[] = ["completed", "running", "pending", "failed"];
  const statusLabel: Record<WorkLogStatus, string> = {
    completed: "Completed",
    running: "Running",
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
