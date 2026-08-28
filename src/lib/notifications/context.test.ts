import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveCheckInContext } from "./context";
import type { ActiveBreak, ActiveTimer } from "@/lib/stores/timer-types";

const START = Date.parse("2026-08-21T09:00:00.000Z");
const NOW = START + 600_000;

function timer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    id: "t1",
    title: "Design sprint",
    projectId: null,
    categoryId: null,
    tags: [],
    notes: null,
    startTime: new Date(START).toISOString(),
    elapsedBeforePauseSec: 0,
    pausedAt: null,
    pomodoroMode: false,
    parentTimerId: null,
    ...overrides,
  };
}

function activeBreak(overrides: Partial<ActiveBreak> = {}): ActiveBreak {
  return {
    id: "b1",
    label: "Lunch",
    startedAt: new Date(START).toISOString(),
    plannedDurationSec: 1_800,
    pausedTimerIds: ["t1"],
    notes: null,
    completedAt: null,
    ...overrides,
  };
}

test("nothing running yields the idle nudge, carrying the last entry title", () => {
  assert.deepEqual(deriveCheckInContext([], null, "Standup", NOW), {
    kind: "idle",
    lastEntryTitle: "Standup",
    idleForSec: null,
  });
});

test("a running timer is reported with its live elapsed time", () => {
  const context = deriveCheckInContext([timer()], null, null, NOW);

  assert.equal(context.kind, "timer-running");
  assert.deepEqual(context, {
    kind: "timer-running",
    timerId: "t1",
    title: "Design sprint",
    elapsedSec: 600,
  });
});

test("a paused timer is distinguished from a running one", () => {
  const paused = timer({ pausedAt: new Date(START + 300_000).toISOString(), elapsedBeforePauseSec: 300 });
  const context = deriveCheckInContext([paused], null, null, NOW);

  assert.equal(context.kind, "timer-paused");
  assert.equal(context.kind === "timer-paused" ? context.elapsedSec : null, 300);
});

test("an active break outranks the timers it paused", () => {
  // Otherwise a check-in during lunch would nag about the paused work timer.
  const paused = timer({ pausedAt: new Date(START).toISOString(), elapsedBeforePauseSec: 0 });
  const context = deriveCheckInContext([paused], activeBreak(), null, NOW);

  assert.equal(context.kind, "break");
  assert.deepEqual(context, { kind: "break", breakId: "b1", label: "Lunch", tag: null, remainingSec: 1_200 });
});

test("a completed break is ignored, falling through to the timers", () => {
  const completed = activeBreak({ completedAt: new Date(NOW).toISOString() });
  const context = deriveCheckInContext([timer()], completed, null, NOW);

  assert.equal(context.kind, "timer-running");
});

test("an open-ended break reports no remaining time", () => {
  const context = deriveCheckInContext([], activeBreak({ plannedDurationSec: 0 }), null, NOW);

  assert.equal(context.kind === "break" ? context.remainingSec : "unset", null);
});

test("the primary timer is preferred over a parallel pause timer", () => {
  const primary = timer({ id: "primary", title: "Feature work" });
  const secondary = timer({ id: "secondary", title: "Interruption", parentTimerId: "primary" });

  const context = deriveCheckInContext([secondary, primary], null, null, NOW);

  assert.equal(context.kind === "timer-running" ? context.timerId : null, "primary");
});

test("a running secondary is chosen over a paused primary", () => {
  const primary = timer({
    id: "primary",
    pausedAt: new Date(START).toISOString(),
    elapsedBeforePauseSec: 60,
  });
  const secondary = timer({ id: "secondary", title: "Interruption", parentTimerId: "primary" });

  const context = deriveCheckInContext([primary, secondary], null, null, NOW);

  assert.equal(context.kind, "timer-running");
  assert.equal(context.kind === "timer-running" ? context.timerId : null, "secondary");
});
