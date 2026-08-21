import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { useTimerStore } from "./timer-store";
import { getActiveTimerElapsedSec } from "./timer-math";

function reset() {
  useTimerStore.setState({ timers: [], activeBreak: null });
}

function startWork(title = "Design sprint") {
  return useTimerStore.getState().startTimer({
    title,
    startTime: new Date().toISOString(),
    projectId: null,
    categoryId: null,
    pomodoroMode: false,
  });
}

beforeEach(reset);

/* ─── Existing invariants must not regress ────────────────────────────────── */

test("only one primary timer can run at a time", () => {
  assert.ok(startWork());
  assert.equal(startWork("Something else"), null);
});

test("a secondary timer requires a paused parent", () => {
  const primary = startWork();
  assert.ok(primary);

  const store = useTimerStore.getState();
  assert.equal(
    store.startSecondaryTimer(primary.id, {
      title: "Interruption",
      startTime: new Date().toISOString(),
      projectId: null,
      categoryId: null,
      pomodoroMode: false,
    }),
    null,
    "must refuse while the parent is still running",
  );

  useTimerStore.getState().pauseTimer(primary.id);
  assert.ok(
    useTimerStore.getState().startSecondaryTimer(primary.id, {
      title: "Interruption",
      startTime: new Date().toISOString(),
      projectId: null,
      categoryId: null,
      pomodoroMode: false,
    }),
  );
});

/* ─── Breaks ──────────────────────────────────────────────────────────────── */

test("starting a break pauses the running timers and records which ones", () => {
  const primary = startWork();
  assert.ok(primary);

  const activeBreak = useTimerStore.getState().startBreak({ label: "Lunch", plannedDurationSec: 1_800 });

  assert.ok(activeBreak);
  assert.deepEqual(activeBreak.pausedTimerIds, [primary.id]);
  assert.ok(useTimerStore.getState().timers[0].pausedAt);
});

test("a break does not appear in the timers list", () => {
  // `dashboard-client` merges `timers` into today's live work, so a break leaking
  // in there would be logged and charted as work.
  startWork();
  useTimerStore.getState().startBreak({ label: "Lunch", plannedDurationSec: 600 });

  assert.equal(useTimerStore.getState().timers.length, 1);
  assert.ok(useTimerStore.getState().timers.every((timer) => timer.title !== "Lunch"));
});

test("only one break at a time", () => {
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 300 });
  assert.equal(useTimerStore.getState().startBreak({ label: "Another", plannedDurationSec: 300 }), null);
});

test("an empty label falls back to Break", () => {
  const activeBreak = useTimerStore.getState().startBreak({ label: "   ", plannedDurationSec: 300 });
  assert.equal(activeBreak?.label, "Break");
});

test("resume is refused while a break is running", () => {
  const primary = startWork();
  assert.ok(primary);
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });

  assert.equal(useTimerStore.getState().resumeTimer(primary.id), false);
  assert.ok(useTimerStore.getState().timers[0].pausedAt, "timer must stay paused");
});

test("starting a new timer is refused during a break unless explicitly allowed", () => {
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });

  assert.equal(startWork(), null);
  assert.ok(
    useTimerStore.getState().startTimer(
      {
        title: "Urgent",
        startTime: new Date().toISOString(),
        projectId: null,
        categoryId: null,
        pomodoroMode: false,
      },
      { allowDuringBreak: true },
    ),
    "the blockNewTimers preference must be switchable off",
  );
});

test("finishing a break resumes exactly the timers it paused", () => {
  const primary = startWork();
  assert.ok(primary);
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });

  const completion = useTimerStore.getState().finishBreak("completed");

  assert.ok(completion);
  assert.deepEqual(completion.resumedTimerIds, [primary.id]);
  assert.equal(useTimerStore.getState().activeBreak, null);
  assert.equal(useTimerStore.getState().timers[0].pausedAt, null);
  assert.equal(useTimerStore.getState().resumeTimer(primary.id), true, "resume is allowed again");
});

test("a timer paused before the break is not resumed by it", () => {
  const primary = startWork();
  assert.ok(primary);
  useTimerStore.getState().pauseTimer(primary.id);
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });

  const completion = useTimerStore.getState().finishBreak("completed");

  assert.deepEqual(completion?.resumedTimerIds, []);
  assert.ok(useTimerStore.getState().timers[0].pausedAt, "must stay as the user left it");
});

test("autoResume off leaves the timers paused", () => {
  const primary = startWork();
  assert.ok(primary);
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });

  const completion = useTimerStore.getState().finishBreak("completed", { autoResume: false });

  assert.deepEqual(completion?.resumedTimerIds, []);
  assert.ok(useTimerStore.getState().timers[0].pausedAt);
});

test("break time is excluded from the resumed timer's elapsed", () => {
  const startedAt = Date.now() - 120_000;
  useTimerStore.setState({
    timers: [
      {
        id: "t1",
        title: "Design sprint",
        projectId: null,
        categoryId: null,
        tags: [],
        notes: null,
        startTime: new Date(startedAt).toISOString(),
        elapsedBeforePauseSec: 0,
        pausedAt: null,
        pomodoroMode: false,
        parentTimerId: null,
      },
    ],
    activeBreak: null,
  });

  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 1 });
  const elapsedAtPause = getActiveTimerElapsedSec(useTimerStore.getState().timers[0]);
  useTimerStore.getState().finishBreak("completed");

  // Resume shifts startTime past the pause, so elapsed is unchanged by the break.
  const afterResume = getActiveTimerElapsedSec(useTimerStore.getState().timers[0]);
  assert.ok(Math.abs(afterResume - elapsedAtPause) <= 1, `${afterResume} vs ${elapsedAtPause}`);
});

test("finishBreak is idempotent, so two tabs cannot both finalise one break", () => {
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });

  assert.ok(useTimerStore.getState().finishBreak("completed"));
  assert.equal(useTimerStore.getState().finishBreak("completed"), null);
});

test("finishBreak reports the outcome it was given", () => {
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });
  assert.equal(useTimerStore.getState().finishBreak("cancelled")?.outcome, "cancelled");
});

test("extending only applies to a timed break", () => {
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 600 });
  assert.equal(useTimerStore.getState().extendBreak(300), true);
  assert.equal(useTimerStore.getState().activeBreak?.plannedDurationSec, 900);

  reset();
  useTimerStore.getState().startBreak({ label: "Break", plannedDurationSec: 0 });
  assert.equal(useTimerStore.getState().extendBreak(300), false, "nothing to extend on open-ended");

  reset();
  assert.equal(useTimerStore.getState().extendBreak(300), false, "no break at all");
});

/* ─── Quick notes ─────────────────────────────────────────────────────────── */

test("appending a note timestamps it onto the timer", () => {
  const primary = startWork();
  assert.ok(primary);

  assert.equal(useTimerStore.getState().appendNote(primary.id, "Found the leak", new Date(2026, 7, 21, 14, 32)), true);
  assert.equal(useTimerStore.getState().timers[0].notes, "[14:32] Found the leak");

  useTimerStore.getState().appendNote(primary.id, "Patched it", new Date(2026, 7, 21, 14, 45));
  assert.equal(useTimerStore.getState().timers[0].notes, "[14:32] Found the leak\n[14:45] Patched it");
});

test("appending an empty note changes nothing", () => {
  const primary = startWork();
  assert.ok(primary);

  assert.equal(useTimerStore.getState().appendNote(primary.id, "   "), false);
  assert.equal(useTimerStore.getState().timers[0].notes, null);
});

test("appending to a timer that no longer exists fails rather than throwing", () => {
  assert.equal(useTimerStore.getState().appendNote("gone", "text"), false);
});

test("notes taken during a break attach to the break", () => {
  useTimerStore.getState().startBreak({ label: "Lunch", plannedDurationSec: 1_800 });

  assert.equal(useTimerStore.getState().appendBreakNote("Walked round the block", new Date(2026, 7, 21, 12, 10)), true);
  assert.equal(useTimerStore.getState().activeBreak?.notes, "[12:10] Walked round the block");
});

test("a break note with no break is a no-op", () => {
  assert.equal(useTimerStore.getState().appendBreakNote("text"), false);
});
