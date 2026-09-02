import assert from "node:assert/strict";
import { test } from "node:test";

import { reconstructRunStarts, type RecordedRun } from "./run-repair";

/**
 * Reproduces the old shift a resumed timer applied: run i's stored startAt is
 * shifted earlier by the sum of every prior run's real duration, matching
 * `resumePausedTimer` + `pauseTimerInPlace`'s pre-fix behaviour.
 */
function shiftLikeTheOldBug(realRuns: RecordedRun[]): RecordedRun[] {
  let cumulativeSec = 0;
  return realRuns.map((run) => {
    const startMs = Date.parse(run.startAt) - cumulativeSec * 1000;
    cumulativeSec += (Date.parse(run.endAt) - Date.parse(run.startAt)) / 1000;
    return { startAt: new Date(startMs).toISOString(), endAt: run.endAt };
  });
}

const REAL_TWO_RUNS: RecordedRun[] = [
  { startAt: "2026-08-21T09:00:00.000Z", endAt: "2026-08-21T10:00:00.000Z" },
  { startAt: "2026-08-21T11:00:00.000Z", endAt: "2026-08-21T12:00:00.000Z" },
];

const REAL_THREE_RUNS: RecordedRun[] = [
  { startAt: "2026-08-21T09:00:00.000Z", endAt: "2026-08-21T09:30:00.000Z" },
  { startAt: "2026-08-21T10:00:00.000Z", endAt: "2026-08-21T10:15:00.000Z" },
  { startAt: "2026-08-21T11:00:00.000Z", endAt: "2026-08-21T13:00:00.000Z" },
];

function durationOf(runs: RecordedRun[]): number {
  return runs.reduce((sum, run) => sum + (Date.parse(run.endAt) - Date.parse(run.startAt)) / 1000, 0);
}

test("inverts the exact shift a resumed timer used to record", () => {
  const corrupted = shiftLikeTheOldBug(REAL_TWO_RUNS);
  // Sanity: the corrupted run 2 starts no later than run 1's real end — with a
  // shorter pause than run 1's duration it would land strictly inside run 1.
  assert.ok(Date.parse(corrupted[1].startAt) <= Date.parse(corrupted[0].endAt));

  const repaired = reconstructRunStarts(corrupted, durationOf(REAL_TWO_RUNS));
  assert.deepEqual(repaired, REAL_TWO_RUNS);
});

test("inverts a three-run shift the same way", () => {
  const corrupted = shiftLikeTheOldBug(REAL_THREE_RUNS);
  const repaired = reconstructRunStarts(corrupted, durationOf(REAL_THREE_RUNS));
  assert.deepEqual(repaired, REAL_THREE_RUNS);
});

test("a single run is never touched — its start was never shifted", () => {
  const runs = [REAL_TWO_RUNS[0]];
  assert.equal(reconstructRunStarts(runs, 3600), null);
});

test("null or missing runs/duration return null", () => {
  assert.equal(reconstructRunStarts(null, 3600), null);
  assert.equal(reconstructRunStarts(undefined, 3600), null);
  assert.equal(reconstructRunStarts(REAL_TWO_RUNS, null), null);
  assert.equal(reconstructRunStarts(REAL_TWO_RUNS, undefined), null);
});

test("already-repaired runs (spans sum to duration) are left alone", () => {
  assert.equal(reconstructRunStarts(REAL_TWO_RUNS, durationOf(REAL_TWO_RUNS)), null);
});

test("running the repair twice is a no-op the second time", () => {
  const corrupted = shiftLikeTheOldBug(REAL_TWO_RUNS);
  const once = reconstructRunStarts(corrupted, durationOf(REAL_TWO_RUNS));
  assert.ok(once);
  const twice = reconstructRunStarts(once, durationOf(REAL_TWO_RUNS));
  assert.equal(twice, null);
});

test("a hand-edited durationSec that doesn't match either signature is left alone", () => {
  const corrupted = shiftLikeTheOldBug(REAL_TWO_RUNS);
  assert.equal(reconstructRunStarts(corrupted, durationOf(REAL_TWO_RUNS) + 500), null);
});

test("unparsable timestamps return null", () => {
  assert.equal(
    reconstructRunStarts(
      [{ startAt: "not a date", endAt: REAL_TWO_RUNS[0].endAt }, REAL_TWO_RUNS[1]],
      durationOf(REAL_TWO_RUNS),
    ),
    null,
  );
});

test("a run whose end doesn't come after its start returns null", () => {
  assert.equal(
    reconstructRunStarts(
      [{ startAt: "2026-08-21T09:00:00.000Z", endAt: "2026-08-21T09:00:00.000Z" }, REAL_TWO_RUNS[1]],
      durationOf(REAL_TWO_RUNS),
    ),
    null,
  );
});
