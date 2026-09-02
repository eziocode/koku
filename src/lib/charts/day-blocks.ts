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

export interface GapBlock {
  kind: "gap";
  from: number;
  to: number;
}

export type TimelineBlock = WorkBlock | GapBlock;

export interface DayTimeline {
  blocks: TimelineBlock[];
  /** How many lanes the day needs; 1 whenever nothing overlaps. */
  lanes: number;
}

/**
 * Lays each day's segments onto the chart's hour domain.
 *
 * A log is drawn as its worked *runs*, not as one duration-wide bar from its
 * start: a log that was paused while a parallel task ran occupies only the
 * stretches it was actually running, and the parallel task fills the stretch
 * between them. Drawing both duration-wide from their starts put them on top of
 * each other, which is what hid the second one.
 *
 * Runs that still overlap — manual entries, imported data — are packed into
 * lanes so every one of them stays visible instead of the last-drawn winning.
 *
 * Gaps *between* logged runs become a hoverable "no log found" block; the empty
 * stretch before the first and after the last is left bare on purpose — there is
 * nothing to explain about time nobody claimed to be working.
 */
export function buildDayBlocks(day: SegmentedDay, domain: HourDomain): DayTimeline {
  const work: WorkBlock[] = [];

  for (const segment of day.segments) {
    const runs = segment.runs?.length
      ? segment.runs
      : [{ startAt: segment.startAt, endAt: segment.endAt, durationSec: segment.durationSec }];
    const live = segment.status === "running" || segment.status === "paused";

    runs.forEach((run, runIndex) => {
      const span = runHourSpan(run);
      const from = Math.max(domain.start, Math.min(domain.end, span.from));
      // A live run with no committed duration still needs a visible sliver, which
      // `hours` carries as the segment's minimum height.
      const rawTo = live && runIndex === runs.length - 1
        ? Math.max(span.to, span.from + segment.hours)
        : span.to;
      const to = Math.max(from, Math.min(domain.end, rawTo));
      if (to <= domain.start || from >= domain.end) {
        return;
      }
      work.push({ kind: "work", from, to, segment, runIndex, lane: 0 });
    });
  }

  work.sort((a, b) => a.from - b.from || a.to - b.to);

  // Greedy lane packing: a run takes the first lane whose last block has ended.
  const laneEnds: number[] = [];
  for (const block of work) {
    let lane = laneEnds.findIndex((end) => end <= block.from + EPS_HOURS);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.to);
    } else {
      laneEnds[lane] = block.to;
    }
    block.lane = lane;
  }

  // Gaps come from the union of every lane: time is only unlogged when *no*
  // parallel task covered it.
  const gaps: GapBlock[] = [];
  let cursor = -Infinity;
  for (const block of work) {
    if (cursor !== -Infinity && block.from > cursor + EPS_HOURS) {
      gaps.push({ kind: "gap", from: cursor, to: block.from });
    }
    cursor = Math.max(cursor, block.to);
  }

  return { blocks: [...gaps, ...work], lanes: Math.max(1, laneEnds.length) };
}

