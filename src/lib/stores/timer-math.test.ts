import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getActiveTimerElapsedSec,
  pauseTimerInPlace,
  parseTimestamp,
  resumePausedTimer,
} from "./timer-math";
import type { ActiveTimer } from "./timer-types";

const START = Date.parse("2026-08-21T09:00:00.000Z");

function timer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    id: "t1",
    title: "Design sprint",
    projectId: null,
    categoryId: null,
    tags: [],
    notes: null,
    startTime: new Date(START).toISOString(),
    originalStartTime: new Date(START).toISOString(),
    elapsedBeforePauseSec: 0,
    pausedAt: null,
    segments: [],
    pomodoroMode: false,
    parentTimerId: null,
    ...overrides,
  };
}

test("parseTimestamp returns null for absent and unparsable values", () => {
  assert.equal(parseTimestamp(undefined), null);
  assert.equal(parseTimestamp(null), null);
  assert.equal(parseTimestamp(""), null);
  assert.equal(parseTimestamp("not a date"), null);
  assert.equal(parseTimestamp("2026-08-21T09:00:00.000Z"), START);
});

test("elapsed is derived from the wall clock, not accumulated ticks", () => {
  // The point of deriving: a tab asleep for three hours still reports the truth.
  assert.equal(getActiveTimerElapsedSec(timer(), START + 3 * 3600 * 1000), 3 * 3600);
  assert.equal(getActiveTimerElapsedSec(timer(), START + 90 * 1000), 90);
});

test("a paused timer freezes at its recorded elapsed regardless of now", () => {
  const paused = timer({
    pausedAt: new Date(START + 60_000).toISOString(),
    elapsedBeforePauseSec: 60,
  });

  assert.equal(getActiveTimerElapsedSec(paused, START + 60_000), 60);
  assert.equal(getActiveTimerElapsedSec(paused, START + 10 * 3600 * 1000), 60);
});

test("an unparsable startTime falls back to the stored elapsed instead of NaN", () => {
  const broken = timer({ startTime: "garbage", elapsedBeforePauseSec: 42 });
  assert.equal(getActiveTimerElapsedSec(broken, START), 42);
});

test("a backwards clock never yields a negative elapsed", () => {
  assert.equal(getActiveTimerElapsedSec(timer(), START - 60_000), 0);
});

test("pause freezes elapsed and stamps pausedAt", () => {
  const paused = pauseTimerInPlace(timer(), START + 120_000);

  assert.equal(paused.elapsedBeforePauseSec, 120);
  assert.equal(paused.pausedAt, new Date(START + 120_000).toISOString());
});

test("pausing an already-paused timer is a no-op", () => {
  const already = timer({ pausedAt: new Date(START).toISOString(), elapsedBeforePauseSec: 5 });
  assert.equal(pauseTimerInPlace(already, START + 999_999), already);
});

test("resume shifts startTime past the pause, so paused time is excluded", () => {
  // Ran 2 min, paused for 5 min, resumed: elapsed must still read 2 min.
  const paused = pauseTimerInPlace(timer(), START + 120_000);
  const resumedAt = START + 120_000 + 300_000;
  const resumed = resumePausedTimer(paused, resumedAt);

  assert.equal(resumed.pausedAt, null);
  assert.equal(getActiveTimerElapsedSec(resumed, resumedAt), 120);
  // And it keeps counting from there.
  assert.equal(getActiveTimerElapsedSec(resumed, resumedAt + 60_000), 180);
});

test("resume shifts startTime but never originalStartTime, so the saved entry keeps the real clock-in", () => {
  const paused = pauseTimerInPlace(timer(), START + 120_000);
  const resumed = resumePausedTimer(paused, START + 120_000 + 300_000);

  assert.notEqual(resumed.startTime, resumed.originalStartTime);
  assert.equal(resumed.originalStartTime, new Date(START).toISOString());
});

test("resume is correct even when the pause spanned hours of closed tab", () => {
  const paused = pauseTimerInPlace(timer(), START + 600_000);
  const resumedAt = START + 600_000 + 8 * 3600 * 1000;
  const resumed = resumePausedTimer(paused, resumedAt);

  assert.equal(getActiveTimerElapsedSec(resumed, resumedAt), 600);
});

test("resuming a running timer is a no-op", () => {
  const running = timer();
  assert.equal(resumePausedTimer(running, START + 5_000), running);
});
