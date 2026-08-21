import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatBreakRemaining,
  getBreakElapsedSec,
  getBreakEndIso,
  getBreakRemainingSec,
  isBreakComplete,
} from "./break-math";
import type { ActiveBreak } from "@/lib/stores/timer-types";

const START = Date.parse("2026-08-21T14:00:00.000Z");

function activeBreak(overrides: Partial<ActiveBreak> = {}): ActiveBreak {
  return {
    id: "b1",
    label: "Break",
    startedAt: new Date(START).toISOString(),
    plannedDurationSec: 600,
    pausedTimerIds: ["t1"],
    notes: null,
    completedAt: null,
    ...overrides,
  };
}

test("elapsed and remaining are derived from timestamps", () => {
  const b = activeBreak();

  assert.equal(getBreakElapsedSec(b, START + 120_000), 120);
  assert.equal(getBreakRemainingSec(b, START + 120_000), 480);
});

test("completes exactly at the boundary, not a second early", () => {
  const b = activeBreak();

  assert.equal(isBreakComplete(b, START + 599_000), false);
  assert.equal(isBreakComplete(b, START + 600_000), true);
  assert.equal(getBreakRemainingSec(b, START + 600_000), 0);
});

test("remaining never goes negative once overdue", () => {
  const b = activeBreak();

  assert.equal(getBreakRemainingSec(b, START + 10 * 600_000), 0);
  assert.equal(isBreakComplete(b, START + 10 * 600_000), true);
});

test("an open-ended break counts up and never completes", () => {
  const b = activeBreak({ plannedDurationSec: 0 });

  assert.equal(getBreakRemainingSec(b, START + 3600_000), null);
  assert.equal(isBreakComplete(b, START + 100 * 3600_000), false);
  assert.equal(getBreakElapsedSec(b, START + 3600_000), 3600);
});

test("a tab asleep for three hours still reports true elapsed", () => {
  // Proves nothing accumulates ticks: no interval ran for those three hours.
  assert.equal(getBreakElapsedSec(activeBreak(), START + 3 * 3600 * 1000), 3 * 3600);
});

test("an unparsable startedAt yields zero elapsed and never completes", () => {
  const b = activeBreak({ startedAt: "garbage" });

  assert.equal(getBreakElapsedSec(b, START + 600_000), 0);
  assert.equal(isBreakComplete(b, START + 10 * 600_000), false);
});

test("a backwards clock never yields negative elapsed", () => {
  assert.equal(getBreakElapsedSec(activeBreak(), START - 60_000), 0);
});

test("end time is clamped to when the break was due, not when it was noticed", () => {
  const b = activeBreak();

  // Noticed 8 hours later, after the laptop lid was closed: must log 10 minutes.
  assert.equal(getBreakEndIso(b, START + 8 * 3600 * 1000), new Date(START + 600_000).toISOString());
  // Ended early (cancelled): uses the actual moment.
  assert.equal(getBreakEndIso(b, START + 120_000), new Date(START + 120_000).toISOString());
});

test("an open-ended break ends now, since it has no due time", () => {
  const b = activeBreak({ plannedDurationSec: 0 });
  assert.equal(getBreakEndIso(b, START + 900_000), new Date(START + 900_000).toISOString());
});

test("formats remaining as m:ss", () => {
  assert.equal(formatBreakRemaining(0), "0:00");
  assert.equal(formatBreakRemaining(65), "1:05");
  assert.equal(formatBreakRemaining(600), "10:00");
});
