import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDayBlocks } from "./day-blocks";
import { FULL_DAY_DOMAIN } from "./hour-domain";
import type { SegmentedDay, WorkLogSegment } from "./segments";

// Local-time literals (no `Z`) so the hour digits match `hourOfDay` regardless
// of the machine's timezone.
function segment(partial: Partial<WorkLogSegment> & { id: string; startAt: string }): WorkLogSegment {
  return {
    entryId: partial.id,
    title: "Work",
    description: null,
    projectId: null,
    projectName: "Unassigned",
    categoryName: null,
    color: "#111111",
    endAt: null,
    durationSec: 3600,
    hours: 1,
    tags: [],
    status: "completed",
    assignment: "unassigned",
    isPartial: false,
    continuedFromPreviousDay: false,
    continuesNextDay: false,
    ...partial,
  };
}

function day(segments: WorkLogSegment[]): SegmentedDay {
  return {
    key: "2024-06-03",
    label: "Mon",
    totalSeconds: 0,
    totalHours: 0,
    segments,
    hasRunning: false,
    hasPaused: false,
    nonWorking: null,
  };
}

test("a paused log's parallel task is drawn in the gap, both in one lane", () => {
  const timeline = buildDayBlocks(
    day([
      segment({
        id: "primary",
        startAt: "2024-06-03T09:00:00",
        endAt: "2024-06-03T12:00:00",
        durationSec: 7200,
        hours: 2,
        runs: [
          { startAt: "2024-06-03T09:00:00", endAt: "2024-06-03T10:00:00", durationSec: 3600 },
          { startAt: "2024-06-03T11:00:00", endAt: "2024-06-03T12:00:00", durationSec: 3600 },
        ],
      }),
      segment({
        id: "parallel",
        startAt: "2024-06-03T10:00:00",
        endAt: "2024-06-03T11:00:00",
        runs: [{ startAt: "2024-06-03T10:00:00", endAt: "2024-06-03T11:00:00", durationSec: 3600 }],
      }),
    ]),
    FULL_DAY_DOMAIN,
  );

  const work = timeline.blocks.filter((block) => block.kind === "work");
  assert.equal(work.length, 3, "two runs of the primary plus the parallel task");
  assert.equal(timeline.lanes, 1, "nothing overlaps, so one lane is enough");
  assert.ok(
    work.some((block) => block.segment.id === "parallel" && block.from === 10 && block.to === 11),
    "the parallel task occupies the primary's pause, not a bar over it",
  );
  assert.equal(
    timeline.blocks.filter((block) => block.kind === "gap").length,
    0,
    "the pause is filled work, not an unlogged gap",
  );
});

test("genuinely overlapping logs are packed into separate lanes", () => {
  const timeline = buildDayBlocks(
    day([
      segment({
        id: "a",
        startAt: "2024-06-03T09:00:00",
        endAt: "2024-06-03T11:00:00",
        durationSec: 7200,
        hours: 2,
        runs: [{ startAt: "2024-06-03T09:00:00", endAt: "2024-06-03T11:00:00", durationSec: 7200 }],
      }),
      segment({
        id: "b",
        startAt: "2024-06-03T09:30:00",
        endAt: "2024-06-03T10:30:00",
        runs: [{ startAt: "2024-06-03T09:30:00", endAt: "2024-06-03T10:30:00", durationSec: 3600 }],
      }),
    ]),
    FULL_DAY_DOMAIN,
  );

  assert.equal(timeline.lanes, 2);
  const lanes = timeline.blocks
    .filter((block): block is Extract<typeof block, { kind: "work" }> => block.kind === "work")
    .map((block) => block.lane);
  assert.deepEqual(lanes.slice().sort(), [0, 1]);
});

test("unlogged time between two logs is still a gap", () => {
  const timeline = buildDayBlocks(
    day([
      segment({ id: "a", startAt: "2024-06-03T09:00:00", endAt: "2024-06-03T10:00:00" }),
      segment({ id: "b", startAt: "2024-06-03T13:00:00", endAt: "2024-06-03T14:00:00" }),
    ]),
    FULL_DAY_DOMAIN,
  );

  const gaps = timeline.blocks.filter((block) => block.kind === "gap");
  assert.equal(gaps.length, 1);
  assert.deepEqual({ from: gaps[0].from, to: gaps[0].to }, { from: 10, to: 13 });
});

test("a segment without runs falls back to one duration-wide block", () => {
  const timeline = buildDayBlocks(
    day([segment({ id: "a", startAt: "2024-06-03T09:00:00", durationSec: 5400, hours: 1.5 })]),
    FULL_DAY_DOMAIN,
  );

  const work = timeline.blocks.filter((block) => block.kind === "work");
  assert.equal(work.length, 1);
  assert.deepEqual({ from: work[0].from, to: work[0].to }, { from: 9, to: 10.5 });
});
