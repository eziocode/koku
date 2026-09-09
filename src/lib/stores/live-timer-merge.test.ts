import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcileCloudTimer } from "./live-timer-merge";
import type { ActiveTimer } from "./timer-types";

const RUN = { startAt: "2024-06-03T09:00:00.000Z", endAt: "2024-06-03T09:30:00.000Z" };

function timer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    id: "t1",
    title: "Work",
    projectId: null,
    categoryId: null,
    tags: [],
    notes: null,
    startTime: "2024-06-03T09:30:00.000Z",
    originalStartTime: "2024-06-03T09:00:00.000Z",
    runStartedAt: "2024-06-03T10:00:00.000Z",
    elapsedBeforePauseSec: 1_800,
    pausedAt: null,
    segments: [RUN],
    pomodoroMode: false,
    parentTimerId: null,
    ...overrides,
  };
}

test("a timer this device never saw is adopted as the cloud describes it", () => {
  const adopted = timer({ segments: [], runStartedAt: null });
  assert.equal(reconcileCloudTimer(undefined, adopted), adopted);
});

test("a poll against a running local timer keeps its run history", () => {
  const local = timer();
  const adopted = timer({ segments: [], runStartedAt: null, elapsedBeforePauseSec: 2_400 });

  const merged = reconcileCloudTimer(local, adopted);

  assert.deepEqual(merged.segments, [RUN], "the pause that happened here survives the poll");
  assert.equal(merged.runStartedAt, "2024-06-03T10:00:00.000Z");
  assert.equal(merged.originalStartTime, "2024-06-03T09:00:00.000Z");
  assert.equal(merged.elapsedBeforePauseSec, 2_400, "cloud still owns the clock math");
});

test("the planned duration is local-only and is not dropped by a poll", () => {
  const merged = reconcileCloudTimer(timer({ plannedDurationSec: 1_500 }), timer({ segments: [] }));
  assert.equal(merged.plannedDurationSec, 1_500);
});

test("a pause made on another device closes the open run here", () => {
  const local = timer({ segments: [], runStartedAt: "2024-06-03T10:00:00.000Z" });
  const adopted = timer({ segments: [], pausedAt: "2024-06-03T10:20:00.000Z" });

  assert.deepEqual(reconcileCloudTimer(local, adopted).segments, [
    { startAt: "2024-06-03T10:00:00.000Z", endAt: "2024-06-03T10:20:00.000Z" },
  ]);
});

test("a remote pause on a timer with no run start falls back to its start time", () => {
  const local = timer({ segments: [], runStartedAt: null, startTime: "2024-06-03T10:05:00.000Z" });
  const adopted = timer({ segments: [], pausedAt: "2024-06-03T10:20:00.000Z" });

  assert.deepEqual(reconcileCloudTimer(local, adopted).segments, [
    { startAt: "2024-06-03T10:05:00.000Z", endAt: "2024-06-03T10:20:00.000Z" },
  ]);
});

test("a resume made on another device opens a run at the record's update time", () => {
  const local = timer({ pausedAt: "2024-06-03T10:20:00.000Z" });
  const adopted = timer({ segments: [], pausedAt: null, updatedAt: "2024-06-03T10:45:00.000Z" });

  const merged = reconcileCloudTimer(local, adopted);

  assert.equal(merged.runStartedAt, "2024-06-03T10:45:00.000Z");
  assert.deepEqual(merged.segments, [RUN], "the earlier runs are still there");
});

test("a pause made here is not re-recorded when the cloud echoes it back", () => {
  const local = timer({ pausedAt: "2024-06-03T10:20:00.000Z" });
  const adopted = timer({ segments: [], pausedAt: "2024-06-03T10:20:00.000Z" });

  assert.deepEqual(reconcileCloudTimer(local, adopted).segments, [RUN]);
});
