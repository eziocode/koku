import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeInitialSchedule,
  evaluateSchedule,
  reanchorSchedule,
  type ScheduleState,
} from "./schedule";

const NOW = Date.parse("2026-08-21T14:00:00.000Z");
const INTERVAL = 30;
const INTERVAL_MS = INTERVAL * 60_000;

const active = { suppressed: false };

test("an uninitialised schedule initialises without firing", () => {
  const state: ScheduleState = { nextFireAt: null, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, active);

  assert.equal(decision.fire, false);
  assert.equal(decision.reason, "uninitialised");
  assert.equal(decision.next.nextFireAt, NOW + INTERVAL_MS);
});

test("computeInitialSchedule waits a full interval before the first check-in", () => {
  // Firing the instant notifications are enabled would be startling.
  assert.deepEqual(computeInitialSchedule(NOW, INTERVAL), {
    nextFireAt: NOW + INTERVAL_MS,
    lastFiredAt: null,
  });
});

test("does not fire before the due time, and leaves state untouched", () => {
  const state: ScheduleState = { nextFireAt: NOW + 60_000, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, active);

  assert.equal(decision.fire, false);
  assert.equal(decision.reason, "not-due");
  assert.equal(decision.next, state);
});

test("fires exactly at the due time", () => {
  const state: ScheduleState = { nextFireAt: NOW, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, active);

  assert.equal(decision.fire, true);
  assert.equal(decision.reason, "due");
});

test("fires when moderately overdue, and re-anchors to the actual fire time", () => {
  // 1.5x overdue: a throttled background tab, still worth notifying about.
  const overdueBy = 1.5 * INTERVAL_MS;
  const state: ScheduleState = { nextFireAt: NOW - overdueBy, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, active);

  assert.equal(decision.fire, true);
  assert.equal(decision.next.lastFiredAt, NOW);
  // Anchored to `now`, NOT to the missed slot — otherwise the next tick would be
  // immediately due again and produce a burst.
  assert.equal(decision.next.nextFireAt, NOW + INTERVAL_MS);
});

test("skips exactly one check-in when waking long after the due time", () => {
  const state: ScheduleState = { nextFireAt: NOW - 3 * INTERVAL_MS, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, active);

  assert.equal(decision.fire, false);
  assert.equal(decision.reason, "stale-wake");
  assert.equal(decision.next.nextFireAt, NOW + INTERVAL_MS);
  assert.equal(decision.next.lastFiredAt, null);

  // And the very next tick, one interval later, fires normally: one skip only.
  const after = evaluateSchedule(decision.next, NOW + INTERVAL_MS, INTERVAL, active);
  assert.equal(after.fire, true);
});

test("the stale-wake threshold is configurable", () => {
  const state: ScheduleState = { nextFireAt: NOW - 3 * INTERVAL_MS, lastFiredAt: null };

  assert.equal(evaluateSchedule(state, NOW, INTERVAL, { suppressed: false, staleFactor: 10 }).fire, true);
  assert.equal(evaluateSchedule(state, NOW, INTERVAL, { suppressed: false, staleFactor: 1 }).fire, false);
});

test("suppression drops the check-in and advances rather than queueing it", () => {
  const state: ScheduleState = { nextFireAt: NOW, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, { suppressed: true });

  assert.equal(decision.fire, false);
  assert.equal(decision.reason, "suppressed");
  assert.equal(decision.next.nextFireAt, NOW + INTERVAL_MS);
  // lastFiredAt untouched: nothing was shown.
  assert.equal(decision.next.lastFiredAt, null);
});

test("suppression never accumulates a backlog to deliver later", () => {
  let state: ScheduleState = { nextFireAt: NOW, lastFiredAt: null };
  let now = NOW;

  for (let i = 0; i < 5; i += 1) {
    state = evaluateSchedule(state, now, INTERVAL, { suppressed: true }).next;
    now += INTERVAL_MS;
  }

  // DND lifts: exactly one check-in, not the five that were suppressed.
  const first = evaluateSchedule(state, now, INTERVAL, active);
  assert.equal(first.fire, true);
  assert.equal(evaluateSchedule(first.next, now, INTERVAL, active).fire, false);
});

test("stale-wake takes precedence over suppression", () => {
  const state: ScheduleState = { nextFireAt: NOW - 5 * INTERVAL_MS, lastFiredAt: null };
  const decision = evaluateSchedule(state, NOW, INTERVAL, { suppressed: true });

  assert.equal(decision.reason, "stale-wake");
  assert.equal(decision.fire, false);
});

test("changing the interval re-anchors so a shortened interval takes effect now", () => {
  // 60 -> 5 minutes should not leave the user waiting the remaining hour.
  const state: ScheduleState = { nextFireAt: NOW + 55 * 60_000, lastFiredAt: NOW };
  const reanchored = reanchorSchedule(state, NOW, 5);

  assert.equal(reanchored.nextFireAt, NOW + 5 * 60_000);
  assert.equal(reanchored.lastFiredAt, NOW);
  assert.equal(evaluateSchedule(reanchored, NOW + 5 * 60_000, 5, active).fire, true);
});

test("repeated firing produces one check-in per interval", () => {
  let state = computeInitialSchedule(NOW, INTERVAL);
  const fired: number[] = [];

  // Tick every minute for three hours, as the real 15s checker effectively does.
  for (let minute = 0; minute <= 180; minute += 1) {
    const now = NOW + minute * 60_000;
    const decision = evaluateSchedule(state, now, INTERVAL, active);
    if (decision.fire) {
      fired.push(minute);
    }
    state = decision.next;
  }

  assert.deepEqual(fired, [30, 60, 90, 120, 150, 180]);
});
