import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { kokuDb } from "@/lib/storage/db";
import { useTimerStore } from "@/lib/stores/timer-store";
import { stopTimerAndPersist } from "./stop-timer";

beforeEach(async () => {
  await kokuDb.transaction("rw", kokuDb.tables, async () => { for (const table of kokuDb.tables) await table.clear(); });
  useTimerStore.setState({ timers: [{ id: "timer", title: "Work", startTime: "2026-09-01T10:00:00.000Z", originalStartTime: "2026-09-01T10:00:00.000Z", tags: [], segments: [], elapsedBeforePauseSec: 0, pomodoroMode: false }], activeBreak: null });
});
test("concurrent and repeated stops write one entry and completion", async () => {
  await Promise.all([stopTimerAndPersist("timer", "2026-09-01T11:00:00.000Z"), stopTimerAndPersist("timer", "2026-09-01T11:00:00.000Z")]);
  await stopTimerAndPersist("timer");
  assert.equal(await kokuDb.timeEntries.count(), 1);
  assert.equal(await kokuDb.timerCompletions.count(), 1);
  assert.equal(useTimerStore.getState().timers.length, 0);
});
test("completion write failure retains active timer and rolls back entry", async () => {
  const put = kokuDb.timerCompletions.put;
  kokuDb.timerCompletions.put = () => { throw new DOMException("Full", "QuotaExceededError"); };
  try { await assert.rejects(stopTimerAndPersist("timer"), /Full/); }
  finally { kokuDb.timerCompletions.put = put; }
  assert.equal(await kokuDb.timeEntries.count(), 0);
  assert.equal(useTimerStore.getState().timers.length, 1);
});
