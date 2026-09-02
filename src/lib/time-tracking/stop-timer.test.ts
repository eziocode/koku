import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEntryFromTimer } from "./stop-timer";
import { pauseTimerInPlace, resumePausedTimer } from "@/lib/stores/timer-math";
import type { ActiveTimer } from "@/lib/stores/timer-types";

const START = Date.parse("2026-08-21T09:00:00.000Z");
const END = new Date(START + 3_600_000).toISOString();

function timer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    id: "t1",
    title: "Design sprint",
    projectId: "p1",
    categoryId: "c1",
    tags: ["deep"],
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

test("carries the timer's identity and computes duration from the end time", () => {
  const entry = buildEntryFromTimer(timer(), END);

  assert.equal(entry.title, "Design sprint");
  assert.equal(entry.projectId, "p1");
  assert.equal(entry.categoryId, "c1");
  assert.equal(entry.startAt, new Date(START).toISOString());
  assert.equal(entry.endAt, END);
  assert.equal(entry.durationSec, 3_600);
});

test("a paused timer's duration is its frozen elapsed, not wall-clock to endedAt", () => {
  const paused = timer({
    pausedAt: new Date(START + 600_000).toISOString(),
    elapsedBeforePauseSec: 600,
  });

  assert.equal(buildEntryFromTimer(paused, END).durationSec, 600);
});

test("pomodoro mode adds its tag without duplicating an existing one", () => {
  assert.deepEqual(buildEntryFromTimer(timer({ pomodoroMode: true }), END).tags, [
    "pomodoro",
    "deep",
  ]);
  assert.deepEqual(
    buildEntryFromTimer(timer({ pomodoroMode: true, tags: ["pomodoro"] }), END).tags,
    ["pomodoro"],
  );
});

test("non-pomodoro timers keep their tags untouched", () => {
  assert.deepEqual(buildEntryFromTimer(timer(), END).tags, ["deep"]);
});

test("pomodoro supplies a default note only when the user wrote none", () => {
  assert.equal(buildEntryFromTimer(timer({ pomodoroMode: true }), END).notes, "Pomodoro focus session");
  assert.equal(
    buildEntryFromTimer(timer({ pomodoroMode: true, notes: "Shipped the parser" }), END).notes,
    "Shipped the parser",
  );
  assert.equal(buildEntryFromTimer(timer(), END).notes, null);
});

test("appended quick notes survive into the entry", () => {
  const withNotes = timer({ notes: "[09:15] Found the leak\n[09:40] Patched it" });

  assert.equal(buildEntryFromTimer(withNotes, END).notes, "[09:15] Found the leak\n[09:40] Patched it");
});

test("the closed run is recorded from runStartedAt, so a resumed run's start is real, not shifted", () => {
  // Run 1: 09:00-10:00 (real). Pause 5 min. Resume, then stop 30 min later.
  let t = timer();
  t = pauseTimerInPlace(t, START + 3_600_000);
  const resumedAt = START + 3_600_000 + 300_000;
  t = resumePausedTimer(t, resumedAt);
  const stoppedAt = new Date(resumedAt + 1_800_000).toISOString();

  const entry = buildEntryFromTimer(t, stoppedAt);

  assert.equal(entry.segments?.length, 2);
  assert.deepEqual(entry.segments?.[0], {
    startAt: new Date(START).toISOString(),
    endAt: new Date(START + 3_600_000).toISOString(),
  });
  // The resumed run's recorded start is the real resume instant, not the
  // resume-shifted `startTime` — that shift is exactly what used to make this
  // run overlap whatever ran during the 5-minute pause.
  assert.equal(entry.segments?.[1].startAt, new Date(resumedAt).toISOString());
  assert.equal(entry.segments?.[1].endAt, stoppedAt);
  assert.equal(entry.durationSec, 3_600 + 1_800);
});

test("a legacy timer with no runStartedAt falls back to startTime for the closed run", () => {
  const legacy = timer({ runStartedAt: undefined });
  const entry = buildEntryFromTimer(legacy, END);

  assert.equal(entry.segments, null); // single run, below the length>1 gate
  assert.equal(entry.durationSec, 3_600);
});
