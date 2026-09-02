/**
 * Pure layout for one day's row in the segmented bar chart: where each worked
 * stretch sits on the hour axis, which lane it occupies, and which stretches
 * nobody logged at all.
 *
 * Kept out of the `"use client"` chart component so it can be unit-tested
 * without pulling React in, the same reason `hour-domain` lives apart.
 */

import { runHourSpan, type HourDomain } from "@/lib/charts/hour-domain";
import type { SegmentedDay, WorkLogSegment } from "@/lib/charts/segments";

/** Fraction-of-24h below which two blocks are treated as touching, not gapped. */
export const EPS_HOURS = 0.01;

export interface WorkBlock {
  kind: "work";
  from: number;
  to: number;
  segment: WorkLogSegment;
  /** Which run of the segment this block draws — a log paused twice has three. */
  runIndex: number;
  /** Row within the day's track, so overlapping logs sit side by side. */
  lane: number;
}

/**
 * The stretch between two runs of the same log: time the log was paused for.
 *
 * Drawn as a thin connector rather than a bar, so the log reads as one thing
 * spanning its whole extent without claiming the pause as worked time.
 */
export interface PauseBlock {
  kind: "pause";
  from: number;
  to: number;
  segment: WorkLogSegment;
  lane: number;
}

export interface GapBlock {
  kind: "gap";
  from: number;
  to: number;
}

export type TimelineBlock = WorkBlock | GapBlock | PauseBlock;

export interface DayTimeline {
  blocks: TimelineBlock[];
  /** How many lanes the day needs; 1 whenever no two logs overlap. */
  lanes: number;
}

/** A log's runs, already clamped to the domain, plus the extent they span. */
interface SegmentLayout {
  segment: WorkLogSegment;
  runs: Array<{ from: number; to: number; runIndex: number }>;
  from: number;
  to: number;
}

/** Runs of one segment, clamped to `domain` and dropped when fully outside it. */
function layoutSegment(segment: WorkLogSegment, domain: HourDomain): SegmentLayout | null {
  const runs = segment.runs?.length
    ? segment.runs
    : [{ startAt: segment.startAt, endAt: segment.endAt, durationSec: segment.durationSec }];
  const live = segment.status === "running" || segment.status === "paused";
  const placed: SegmentLayout["runs"] = [];

  runs.forEach((run, runIndex) => {
    const span = runHourSpan(run);
    const from = Math.max(domain.start, Math.min(domain.end, span.from));
    // A live run with no committed duration still needs a visible sliver, which
    // `hours` carries as the segment's minimum height.
    const rawTo =
      live && runIndex === runs.length - 1
        ? Math.max(span.to, span.from + segment.hours)
        : span.to;
    const to = Math.max(from, Math.min(domain.end, rawTo));
    if (to <= domain.start || from >= domain.end) {
      return;
    }
    placed.push({ from, to, runIndex });
  });

  if (placed.length === 0) {
    return null;
  }

  placed.sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    segment,
    runs: placed,
    from: placed[0].from,
    to: placed.reduce((max, run) => Math.max(max, run.to), placed[0].to),
  };
}

/**
 * Lays each day's segments onto the chart's hour domain.
 *
 * A log is drawn as its worked *runs*, not as one duration-wide bar from its
 * start: a log that was paused while a parallel task ran occupies only the
 * stretches it was actually running, and its pauses are drawn as connectors
 * joining them. Drawing both duration-wide from their starts put them on top of
 * each other, which is what hid the second one.
 *
 * Lanes are packed per *log*, not per run: a log holds one lane from its first
 * run to its last, so the parallel task started during its pause lands on a lane
 * of its own instead of threading through the gap and reading as one stripe.
 *
 * A "no log found" gap is only drawn where neither a run nor a pause covers the
 * time. The empty stretch before the first log and after the last is left bare
 * on purpose — there is nothing to explain about time nobody claimed.
 */
export function buildDayBlocks(day: SegmentedDay, domain: HourDomain): DayTimeline {
  const layouts = day.segments
    .map((segment) => layoutSegment(segment, domain))
    .filter((layout): layout is SegmentLayout => layout !== null)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  // Greedy lane packing over whole logs: a log takes the first lane whose last
  // log has ended.
  const laneEnds: number[] = [];
  const work: WorkBlock[] = [];
  const pauses: PauseBlock[] = [];

  for (const layout of layouts) {
    let lane = laneEnds.findIndex((end) => end <= layout.from + EPS_HOURS);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(layout.to);
    } else {
      laneEnds[lane] = layout.to;
    }

    layout.runs.forEach((run, index) => {
      work.push({
        kind: "work",
        from: run.from,
        to: run.to,
        segment: layout.segment,
        runIndex: run.runIndex,
        lane,
      });
      const next = layout.runs[index + 1];
      if (next && next.from > run.to + EPS_HOURS) {
        pauses.push({ kind: "pause", from: run.to, to: next.from, segment: layout.segment, lane });
      }
    });
  }

  // Gaps come from the union of every lane, pauses included: time is only
  // unlogged when *nothing* — no parallel task, no paused log — covered it.
  const covered = [...work, ...pauses].sort((a, b) => a.from - b.from || a.to - b.to);
  const gaps: GapBlock[] = [];
  let cursor = -Infinity;
  for (const block of covered) {
    if (cursor !== -Infinity && block.from > cursor + EPS_HOURS) {
      gaps.push({ kind: "gap", from: cursor, to: block.from });
    }
    cursor = Math.max(cursor, block.to);
  }

  // Gaps first, then pauses, so the work bars paint over both.
  return { blocks: [...gaps, ...pauses, ...work], lanes: Math.max(1, laneEnds.length) };
}
