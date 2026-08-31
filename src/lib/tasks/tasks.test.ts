import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { kokuDb } from "@/lib/storage/db";
import { completeTask, createTask, moveTask, reopenTask, updateTask } from "./tasks";

beforeEach(async () => {
  await kokuDb.tasks.clear();
  await kokuDb.pendingUpserts.clear();
  await kokuDb.pendingDeletes.clear();
});

afterEach(async () => {
  await kokuDb.tasks.clear();
});

/**
 * Waits past a full second from when a task's status changed: accrual banks
 * `Math.floor(elapsedMs / 1000)`, so anything shorter always banks 0.
 */
function tick(ms = 1050) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("creating a task in_progress starts the stopwatch immediately", async () => {
  const task = await createTask({ title: "Ship it", status: "in_progress" });
  assert.equal(task.accumulatedSec, 0);
  assert.ok(task.inProgressSince);
});

test("creating a task in any other status leaves the stopwatch off", async () => {
  const task = await createTask({ title: "Later", status: "open" });
  assert.equal(task.inProgressSince, null);
  assert.equal(task.accumulatedSec, 0);
});

test("moving open -> in_progress -> paused banks the elapsed stretch and stops the clock", async () => {
  const task = await createTask({ title: "Work", status: "open" });
  await moveTask(task.id, "in_progress", task.sortOrder);
  await tick();
  const paused = await moveTask(task.id, "paused", task.sortOrder);

  assert.equal(paused!.inProgressSince, null);
  assert.ok(paused!.accumulatedSec > 0, "expected time banked from the in_progress stretch");
});

test("moving back to in_progress resumes accrual on top of the existing bank", async () => {
  const task = await createTask({ title: "Work", status: "open" });
  await moveTask(task.id, "in_progress", task.sortOrder);
  await tick();
  const paused = await moveTask(task.id, "paused", task.sortOrder);
  const bankedAfterFirstRun = paused!.accumulatedSec;

  const resumed = await moveTask(task.id, "in_progress", task.sortOrder);
  assert.equal(resumed!.accumulatedSec, bankedAfterFirstRun);
  assert.ok(resumed!.inProgressSince);
});

test("marking done freezes the total, banks any open stretch, and overwrites dueAt with completion time", async () => {
  const task = await createTask({ title: "Work", status: "open", dueAt: "2020-01-01T00:00:00.000Z" });
  await moveTask(task.id, "in_progress", task.sortOrder);
  await tick();

  const before = Date.now();
  const done = await completeTask(task.id);
  const after = Date.now();

  assert.equal(done!.status, "done");
  assert.equal(done!.inProgressSince, null);
  assert.ok(done!.accumulatedSec > 0);
  assert.ok(done!.completedAt);
  assert.ok(done!.dueAt);
  const dueAtMs = Date.parse(done!.dueAt!);
  assert.ok(dueAtMs >= before && dueAtMs <= after, "expected dueAt overwritten with the completion moment");
});

test("completing an already-in_progress task via updateTask agrees with the drag/detail-button path", async () => {
  const task = await createTask({ title: "Work", status: "in_progress" });
  await tick();
  const done = await updateTask(task.id, { status: "done" });
  assert.equal(done!.status, "done");
  assert.ok(done!.accumulatedSec > 0);
});

test("reopening clears completedAt and dueAt, and does not resume the stopwatch on its own", async () => {
  const task = await createTask({ title: "Work", status: "open" });
  await moveTask(task.id, "in_progress", task.sortOrder);
  const done = await completeTask(task.id);
  assert.ok(done!.dueAt);

  const reopened = await reopenTask(task.id);
  assert.equal(reopened!.status, "open");
  assert.equal(reopened!.completedAt, null);
  assert.equal(reopened!.dueAt, null);
  assert.equal(reopened!.inProgressSince, null);
  assert.ok(reopened!.reopenedAt);
});

test("a status change that doesn't cross in_progress/done leaves dueAt untouched", async () => {
  const task = await createTask({ title: "Work", status: "open", dueAt: "2030-01-01T00:00:00.000Z" });
  const moved = await moveTask(task.id, "paused", task.sortOrder);
  assert.equal(moved!.dueAt, "2030-01-01T00:00:00.000Z");
});
