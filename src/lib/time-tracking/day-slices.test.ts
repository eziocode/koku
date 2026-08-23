import assert from "node:assert/strict";
import { test } from "node:test";

import {
  entryTouchesDay,
  getEntrySecondsInDays,
  getEntrySecondsOnDay,
  splitEntryAcrossDays,
} from "./day-slices";

/** Local-time literals keep these assertions independent of the host timezone. */
function local(value: string) {
  return new Date(value).toISOString();
}

test("an entry inside one day yields a single slice", () => {
  const slices = splitEntryAcrossDays({
    startAt: local("2026-08-21T09:00:00"),
    endAt: local("2026-08-21T11:00:00"),
    durationSec: 7200,
  });

  assert.equal(slices.length, 1);
  assert.equal(slices[0].durationSec, 7200);
  assert.equal(slices[0].isFirst, true);
  assert.equal(slices[0].isLast, true);
});

test("a timer left running spreads its hours over the days it actually covers", () => {
  // The reported bug: 39 h starting Friday used to land entirely on Friday.
  const slices = splitEntryAcrossDays({
    startAt: local("2026-08-21T09:00:00"),
    endAt: local("2026-08-23T00:00:00"),
    durationSec: 39 * 3600,
  });

  assert.deepEqual(
    slices.map((slice) => slice.dayKey),
    ["2026-08-21", "2026-08-22"],
  );
  // Fri 09:00 → midnight is 15 h; the rest belongs to Saturday.
  assert.equal(slices[0].durationSec, 15 * 3600);
  assert.equal(slices[1].durationSec, 24 * 3600);
  assert.equal(slices.reduce((sum, s) => sum + s.durationSec, 0), 39 * 3600);
});

test("no day ever exceeds 24 h of attributed time", () => {
  const slices = splitEntryAcrossDays({
    startAt: local("2026-08-21T00:00:00"),
    endAt: local("2026-08-26T00:00:00"),
    durationSec: 5 * 24 * 3600,
  });

  assert.equal(slices.length, 5);
  for (const slice of slices) {
    assert.ok(slice.durationSec <= 24 * 3600, `${slice.dayKey} over 24 h`);
  }
});

test("slices sum to the recorded duration even when it is shorter than the span", () => {
  // A paused timer: 20 h tracked across a 39 h wall-clock span.
  const total = 20 * 3600;
  const slices = splitEntryAcrossDays({
    startAt: local("2026-08-21T09:00:00"),
    endAt: local("2026-08-23T00:00:00"),
    durationSec: total,
  });

  assert.equal(slices.reduce((sum, s) => sum + s.durationSec, 0), total);
});

test("an open-ended entry ends at startAt + durationSec and keeps a null end on its last slice", () => {
  const slices = splitEntryAcrossDays({
    startAt: local("2026-08-21T22:00:00"),
    endAt: null,
    durationSec: 5 * 3600,
  });

  assert.deepEqual(
    slices.map((slice) => slice.dayKey),
    ["2026-08-21", "2026-08-22"],
  );
  assert.equal(slices[0].endAt !== null, true);
  assert.equal(slices[1].endAt, null);
  assert.equal(slices[0].durationSec, 2 * 3600);
  assert.equal(slices[1].durationSec, 3 * 3600);
});

test("duration falls back to the span when durationSec is missing", () => {
  const slices = splitEntryAcrossDays({
    startAt: local("2026-08-21T23:00:00"),
    endAt: local("2026-08-22T01:00:00"),
    durationSec: null,
  });

  assert.equal(slices.length, 2);
  assert.equal(slices.reduce((sum, s) => sum + s.durationSec, 0), 7200);
});

test("a zero-duration or unparseable entry degrades gracefully", () => {
  assert.equal(splitEntryAcrossDays({ startAt: "not-a-date", durationSec: 3600 }).length, 0);
  const zero = splitEntryAcrossDays({ startAt: local("2026-08-21T09:00:00"), durationSec: 0 });
  assert.equal(zero.length, 1);
  assert.equal(zero[0].durationSec, 0);
});

test("per-day lookups only count the hours worked on that day", () => {
  const entry = {
    startAt: local("2026-08-21T09:00:00"),
    endAt: local("2026-08-23T00:00:00"),
    durationSec: 39 * 3600,
  };

  assert.equal(getEntrySecondsOnDay(entry, "2026-08-21"), 15 * 3600);
  assert.equal(getEntrySecondsOnDay(entry, "2026-08-23"), 0);
  assert.equal(
    getEntrySecondsInDays(entry, new Set(["2026-08-21", "2026-08-22"])),
    39 * 3600,
  );
  assert.equal(entryTouchesDay(entry, "2026-08-22"), true);
  assert.equal(entryTouchesDay(entry, "2026-08-24"), false);
});
