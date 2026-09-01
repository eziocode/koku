import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRoutines,
  circularMinuteDistance,
  dueRoutines,
  ROUTINE_MIN_OCCURRENCES,
  ROUTINE_WINDOW_MIN,
  type RoutineSeed,
} from "./routine-suggestions";

/** Builds an ISO timestamp for a local time-of-day, so tests are independent of the runner's timezone. */
function atLocalTime(hour: number, minute: number, day = 1): string {
  return new Date(2026, 7, day, hour, minute, 0, 0).toISOString();
}

function seed(overrides: Partial<RoutineSeed> = {}): RoutineSeed {
  return {
    title: "Standup",
    projectId: "p1",
    categoryId: "c1",
    taskId: null,
    tags: ["team"],
    at: atLocalTime(9, 30),
    durationSec: 900,
    ...overrides,
  };
}

test("fewer than the occurrence floor produces no routine", () => {
  const seeds = Array.from({ length: ROUTINE_MIN_OCCURRENCES - 1 }, (_, i) => seed({ at: atLocalTime(9, 30, i + 1) }));
  assert.deepEqual(buildRoutines(seeds), []);
});

test("occurrences at the floor and within the window form a routine", () => {
  const seeds = Array.from({ length: ROUTINE_MIN_OCCURRENCES }, (_, i) => seed({ at: atLocalTime(9, 30, i + 1) }));
  const routines = buildRoutines(seeds);
  assert.equal(routines.length, 1);
  assert.equal(routines[0].count, ROUTINE_MIN_OCCURRENCES);
  assert.equal(routines[0].centreMinute, 9 * 60 + 30);
});

test("an occurrence outside the window does not join the cluster", () => {
  // A larger tight cluster so a single distant outlier can't pull the rough
  // circular-mean centre far enough to exclude the genuine cluster too.
  const seeds = [
    seed({ at: atLocalTime(9, 28, 1) }),
    seed({ at: atLocalTime(9, 30, 2) }),
    seed({ at: atLocalTime(9, 31, 3) }),
    seed({ at: atLocalTime(9, 29, 4) }),
    seed({ at: atLocalTime(9, 32, 5) }),
    seed({ at: atLocalTime(14, 0, 6) }), // far outside the ±45 min window
  ];
  const routines = buildRoutines(seeds);
  assert.equal(routines.length, 1);
  assert.equal(routines[0].count, 5);
});

test("an outlier can drop the whole cluster below the floor", () => {
  const seeds = [
    seed({ at: atLocalTime(9, 30, 1) }),
    seed({ at: atLocalTime(9, 35, 2) }),
    seed({ at: atLocalTime(14, 0, 3) }),
  ];
  assert.deepEqual(buildRoutines(seeds), []);
});

test("circular distance wraps across midnight", () => {
  assert.equal(circularMinuteDistance(10, 1430), 20);
  assert.equal(circularMinuteDistance(0, 1439), 1);
});

test("a routine clustered around midnight centres near midnight, not midday", () => {
  const seeds = [
    seed({ title: "Nightly wrap-up", at: atLocalTime(23, 50, 1) }),
    seed({ title: "Nightly wrap-up", at: atLocalTime(0, 10, 2) }),
    seed({ title: "Nightly wrap-up", at: atLocalTime(23, 55, 3) }),
  ];
  const routines = buildRoutines(seeds);
  assert.equal(routines.length, 1);
  const distanceFromMidnight = Math.min(routines[0].centreMinute, 1440 - routines[0].centreMinute);
  assert.ok(distanceFromMidnight < ROUTINE_WINDOW_MIN, `expected near midnight, got minute ${routines[0].centreMinute}`);
});

test("project/category/task come from the most recent occurrence", () => {
  const seeds = [
    seed({ at: atLocalTime(9, 30, 1), projectId: "old", categoryId: "old-cat", taskId: "old-task" }),
    seed({ at: atLocalTime(9, 32, 2), projectId: "old", categoryId: "old-cat", taskId: "old-task" }),
    seed({ at: atLocalTime(9, 28, 3), projectId: "new", categoryId: "new-cat", taskId: "new-task" }),
  ];
  const routines = buildRoutines(seeds);
  assert.equal(routines[0].projectId, "new");
  assert.equal(routines[0].categoryId, "new-cat");
  assert.equal(routines[0].taskId, "new-task");
});

test("tags need majority presence to survive", () => {
  const seeds = [
    seed({ at: atLocalTime(9, 30, 1), tags: ["team", "urgent"] }),
    seed({ at: atLocalTime(9, 31, 2), tags: ["team"] }),
    seed({ at: atLocalTime(9, 29, 3), tags: ["team"] }),
  ];
  const routines = buildRoutines(seeds);
  assert.deepEqual(routines[0].tags, ["team"]);
});

test("average duration is computed only from occurrences that have one", () => {
  const seeds = [
    seed({ at: atLocalTime(9, 30, 1), durationSec: 600 }),
    seed({ at: atLocalTime(9, 31, 2), durationSec: 1200 }),
    seed({ at: atLocalTime(9, 29, 3), durationSec: null }),
  ];
  const routines = buildRoutines(seeds);
  assert.equal(routines[0].avgDurationSec, 900);
});

test("dueRoutines only returns routines whose window contains now", () => {
  const morningSeeds = Array.from({ length: 3 }, (_, i) => seed({ title: "Standup", at: atLocalTime(9, 30, i + 1) }));
  const eveningSeeds = Array.from({ length: 3 }, (_, i) =>
    seed({ title: "Wrap-up", at: atLocalTime(17, 0, i + 1) }),
  );
  const routines = buildRoutines([...morningSeeds, ...eveningSeeds]);

  const nowMs = new Date(2026, 7, 10, 9, 40, 0, 0).getTime();
  const due = dueRoutines(routines, nowMs);
  assert.equal(due.length, 1);
  assert.equal(due[0].title, "Standup");
});

test("dueRoutines excludes routines already being tracked", () => {
  const seeds = Array.from({ length: 3 }, (_, i) => seed({ title: "Standup", at: atLocalTime(9, 30, i + 1) }));
  const routines = buildRoutines(seeds);
  const nowMs = new Date(2026, 7, 10, 9, 30, 0, 0).getTime();

  assert.equal(dueRoutines(routines, nowMs, { runningTitles: ["Standup"] }).length, 0);
  assert.equal(dueRoutines(routines, nowMs, { runningTitles: ["Something else"] }).length, 1);
});

test("dueRoutines orders by count then recency, and respects the limit", () => {
  const nowMs = new Date(2026, 7, 10, 9, 30, 0, 0).getTime();
  const frequent = Array.from({ length: 5 }, (_, i) =>
    seed({ title: "Frequent", at: atLocalTime(9, 30, i + 1) }),
  );
  const rare = Array.from({ length: 3 }, (_, i) => seed({ title: "Rare", at: atLocalTime(9, 30, i + 10) }));
  const routines = buildRoutines([...frequent, ...rare]);

  const due = dueRoutines(routines, nowMs, { limit: 1 });
  assert.equal(due.length, 1);
  assert.equal(due[0].title, "Frequent");
});
