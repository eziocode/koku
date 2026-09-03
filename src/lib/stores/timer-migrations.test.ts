import assert from "node:assert/strict";
import { test } from "node:test";

import {
  migratePersistedTimerState,
  migrateTimers,
  normalizeStoredBreak,
  normalizeStoredTimer,
} from "./timer-migrations";

function storedTimer(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Design sprint",
    projectId: "p1",
    categoryId: null,
    tags: ["deep"],
    notes: null,
    startTime: "2026-08-21T09:00:00.000Z",
    elapsedBeforePauseSec: 0,
    pausedAt: null,
    pomodoroMode: false,
    parentTimerId: null,
    ...overrides,
  };
}

/* ─── The load-bearing guarantee ──────────────────────────────────────────── */
/* A throwing or over-eager migration silently wipes a user's in-flight timers.  */
/* Every case below asserts timers survive whenever they were recoverable.       */

test("migrates the legacy single activeTimer shape", () => {
  const { timers } = migratePersistedTimerState({ activeTimer: storedTimer({ id: undefined }) });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].title, "Design sprint");
  // A missing id is backfilled rather than causing the timer to be dropped.
  assert.equal(typeof timers[0].id, "string");
  assert.ok(timers[0].id.length > 0);
});

test("migrates a timers array including a paused timer and a secondary", () => {
  const { timers } = migratePersistedTimerState({
    timers: [
      storedTimer({ id: "primary", pausedAt: "2026-08-21T09:30:00.000Z", elapsedBeforePauseSec: 1800 }),
      storedTimer({ id: "secondary", title: "Standup", parentTimerId: "primary" }),
    ],
  });

  assert.equal(timers.length, 2);
  assert.equal(timers[0].pausedAt, "2026-08-21T09:30:00.000Z");
  assert.equal(timers[0].elapsedBeforePauseSec, 1800);
  assert.equal(timers[1].parentTimerId, "primary");
});

test("drops individual malformed timers but keeps the valid ones", () => {
  const { timers } = migratePersistedTimerState({
    timers: [storedTimer(), { title: "no start time" }, null, 42, storedTimer({ id: "t2" })],
  });

  assert.deepEqual(
    timers.map((timer) => timer.id),
    ["t1", "t2"],
  );
});

test("returns no timers for null, garbage, and non-array timers without throwing", () => {
  const empty = { timers: [], activeBreak: null };

  assert.deepEqual(migratePersistedTimerState(null), empty);
  assert.deepEqual(migratePersistedTimerState("garbage"), empty);
  assert.deepEqual(migratePersistedTimerState(undefined), empty);
  assert.deepEqual(migratePersistedTimerState({ timers: "nope" }), empty);
  assert.deepEqual(migratePersistedTimerState({}), empty);
});

test("normalizes missing and wrongly-typed fields to safe defaults", () => {
  const timer = normalizeStoredTimer({
    title: "Loose",
    startTime: "2026-08-21T09:00:00.000Z",
    tags: ["ok", 7, null, "fine"],
    elapsedBeforePauseSec: "not a number",
    pomodoroMode: "yes",
    projectId: 12,
  });

  assert.ok(timer);
  assert.deepEqual(timer.tags, ["ok", "fine"]);
  assert.equal(timer.elapsedBeforePauseSec, 0);
  assert.equal(timer.pomodoroMode, false);
  assert.equal(timer.projectId, null);
  assert.equal(timer.parentTimerId, null);
});

test("rejects a timer missing the fields that make it meaningful", () => {
  assert.equal(normalizeStoredTimer({ startTime: "2026-08-21T09:00:00.000Z" }), null);
  assert.equal(normalizeStoredTimer({ title: "No start" }), null);
  assert.equal(normalizeStoredTimer(null), null);
});

test("migrateTimers prefers the array shape when both shapes are present", () => {
  const timers = migrateTimers({
    timers: [storedTimer({ id: "fromArray" })],
    activeTimer: storedTimer({ id: "fromLegacy" }),
  });

  assert.deepEqual(
    timers.map((timer) => timer.id),
    ["fromArray"],
  );
});

/* ─── Break recovery (schema version 2) ───────────────────────────────────── */

function storedBreak(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    label: "Lunch",
    startedAt: "2026-08-21T12:00:00.000Z",
    plannedDurationSec: 1_800,
    pausedTimerIds: ["t1"],
    notes: null,
    completedAt: null,
    ...overrides,
  };
}

test("recovers an in-progress break alongside the timers", () => {
  const state = migratePersistedTimerState({
    timers: [storedTimer({ pausedAt: "2026-08-21T12:00:00.000Z", elapsedBeforePauseSec: 900 })],
    activeBreak: storedBreak(),
  });

  assert.equal(state.timers.length, 1);
  assert.ok(state.activeBreak);
  assert.equal(state.activeBreak.label, "Lunch");
  assert.deepEqual(state.activeBreak.pausedTimerIds, ["t1"]);
});

test("a v1 payload with no break migrates to a null break, timers intact", () => {
  const state = migratePersistedTimerState({ timers: [storedTimer()] });

  assert.equal(state.timers.length, 1);
  assert.equal(state.activeBreak, null);
});

test("a corrupt break is dropped but the timers always survive", () => {
  // The asymmetry is intentional: losing a break costs minutes of accuracy,
  // losing a timer costs hours of work.
  const corruptBreaks: unknown[] = [
    storedBreak({ startedAt: "garbage" }),
    storedBreak({ startedAt: 12345 }),
    storedBreak({ id: undefined }),
    storedBreak({ label: 7 }),
    storedBreak({ plannedDurationSec: -1 }),
    storedBreak({ plannedDurationSec: "thirty" }),
    storedBreak({ plannedDurationSec: Number.NaN }),
    "not an object",
    42,
    null,
  ];

  for (const activeBreak of corruptBreaks) {
    const state = migratePersistedTimerState({ timers: [storedTimer()], activeBreak });

    assert.equal(state.activeBreak, null, JSON.stringify(activeBreak) ?? String(activeBreak));
    assert.equal(state.timers.length, 1, "timers must survive a corrupt break");
  }
});

test("an open-ended break (zero planned duration) is valid", () => {
  const recovered = normalizeStoredBreak(storedBreak({ plannedDurationSec: 0 }));

  assert.ok(recovered);
  assert.equal(recovered.plannedDurationSec, 0);
});

test("break normalisation filters non-string paused ids and defaults missing ones", () => {
  const recovered = normalizeStoredBreak(
    storedBreak({ pausedTimerIds: ["a", 3, null, "b"], notes: 9, completedAt: 4 }),
  );

  assert.ok(recovered);
  assert.deepEqual(recovered.pausedTimerIds, ["a", "b"]);
  assert.equal(recovered.notes, null);
  assert.equal(recovered.completedAt, null);

  const noIds = normalizeStoredBreak(storedBreak({ pausedTimerIds: "nope" }));
  assert.deepEqual(noIds?.pausedTimerIds, []);
});

test("a completed break round-trips its completedAt guard", () => {
  const recovered = normalizeStoredBreak(storedBreak({ completedAt: "2026-08-21T12:30:00.000Z" }));

  assert.equal(recovered?.completedAt, "2026-08-21T12:30:00.000Z");
});

test("no input shape ever loses timers that were present", () => {
  const shapes: unknown[] = [
    { timers: [storedTimer()] },
    { timers: [storedTimer()], activeBreak: storedBreak() },
    { timers: [storedTimer()], activeBreak: "corrupt" },
    { activeTimer: storedTimer() },
    { activeTimer: storedTimer(), activeBreak: storedBreak({ startedAt: "nope" }) },
  ];

  for (const shape of shapes) {
    assert.equal(migratePersistedTimerState(shape).timers.length, 1, JSON.stringify(shape));
  }
});

/* ─── Quick-action identity survives a reload ────────────────────────────── */
/* Previously dropped by `normalizeStoredBreak`, which silently demoted a       */
/* running quick action ("Call") to a plain break on every page reload.         */

test("a quick action's project, category, tag, and description survive normalisation", () => {
  const recovered = normalizeStoredBreak(
    storedBreak({
      label: "Call",
      projectId: "proj-1",
      categoryId: "cat-1",
      tag: "call",
      description: "Weekly sync",
    }),
  );

  assert.ok(recovered);
  assert.equal(recovered.projectId, "proj-1");
  assert.equal(recovered.categoryId, "cat-1");
  assert.equal(recovered.tag, "call");
  assert.equal(recovered.description, "Weekly sync");
});

test("a plain break (no quick-action fields) normalises them to null, not undefined", () => {
  const recovered = normalizeStoredBreak(storedBreak());

  assert.ok(recovered);
  assert.equal(recovered.projectId, null);
  assert.equal(recovered.categoryId, null);
  assert.equal(recovered.tag, null);
  assert.equal(recovered.description, null);
});

test("wrongly-typed quick-action fields degrade to null rather than surviving as garbage", () => {
  const recovered = normalizeStoredBreak(
    storedBreak({ projectId: 5, categoryId: false, tag: {}, description: [] }),
  );

  assert.ok(recovered);
  assert.equal(recovered.projectId, null);
  assert.equal(recovered.categoryId, null);
  assert.equal(recovered.tag, null);
  assert.equal(recovered.description, null);
});

test("a planned duration survives a persist/rehydrate round trip", () => {
  const state = migratePersistedTimerState({
    timers: [storedTimer({ plannedDurationSec: 600 })],
  });

  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].plannedDurationSec, 600);
});

test("a garbage planned duration normalises away instead of poisoning the countdown", () => {
  const cases = ["600", Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}];

  for (const plannedDurationSec of cases) {
    const timer = normalizeStoredTimer(storedTimer({ plannedDurationSec }));
    assert.equal(timer?.plannedDurationSec, undefined, `for ${String(plannedDurationSec)}`);
  }

  assert.equal(normalizeStoredTimer(storedTimer({ plannedDurationSec: 599.6 }))?.plannedDurationSec, 600);
  assert.equal(normalizeStoredTimer(storedTimer({ plannedDurationSec: -5 }))?.plannedDurationSec, 0);
});
