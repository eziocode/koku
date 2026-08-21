import assert from "node:assert/strict";
import { test } from "node:test";

import { computeDndUntilIso, formatDndRemaining, resolveDnd } from "./dnd";

const NOW = Date.parse("2026-08-21T14:00:00.000Z");

test("mode off is never active", () => {
  const state = resolveDnd({ mode: "off", untilIso: null }, NOW);

  assert.deepEqual(state, { active: false, expiresAt: null, expired: false });
});

test("indefinite is active forever and never expires", () => {
  const state = resolveDnd({ mode: "indefinite", untilIso: null }, NOW);

  assert.equal(state.active, true);
  assert.equal(state.expiresAt, null);
  assert.equal(state.expired, false);
  assert.equal(resolveDnd({ mode: "indefinite", untilIso: null }, NOW + 1e12).active, true);
});

test("a timed DND is active right up to its expiry, then expired", () => {
  const untilIso = new Date(NOW + 60_000).toISOString();

  assert.equal(resolveDnd({ mode: "until", untilIso }, NOW).active, true);
  assert.equal(resolveDnd({ mode: "until", untilIso }, NOW + 59_999).active, true);

  const lapsed = resolveDnd({ mode: "until", untilIso }, NOW + 60_000);
  assert.equal(lapsed.active, false);
  assert.equal(lapsed.expired, true);
});

test("a malformed or missing untilIso is treated as lapsed, never as forever", () => {
  // Silencing koku permanently because of a corrupt string would be the worst
  // possible failure direction here.
  for (const untilIso of ["garbage", "", null]) {
    const state = resolveDnd({ mode: "until", untilIso }, NOW);
    assert.equal(state.active, false, `untilIso=${String(untilIso)}`);
    assert.equal(state.expired, true, `untilIso=${String(untilIso)}`);
  }
});

test("computes 30m and 1h expiries", () => {
  const now = new Date(NOW);

  assert.equal(computeDndUntilIso("30m", now), new Date(NOW + 30 * 60_000).toISOString());
  assert.equal(computeDndUntilIso("1h", now), new Date(NOW + 60 * 60_000).toISOString());
  assert.equal(computeDndUntilIso("indefinite", now), null);
});

test("'tomorrow' lands on the next occurrence of the resume hour", () => {
  // 06:00 local, resume at 08:00 → later the same day.
  const morning = new Date(2026, 7, 21, 6, 0);
  const sameDay = computeDndUntilIso("tomorrow", morning);
  assert.ok(sameDay);
  assert.deepEqual(
    [new Date(sameDay).getDate(), new Date(sameDay).getHours(), new Date(sameDay).getMinutes()],
    [21, 8, 0],
  );

  // 22:00 local, resume at 08:00 → the following day.
  const night = new Date(2026, 7, 21, 22, 0);
  const nextDay = computeDndUntilIso("tomorrow", night);
  assert.ok(nextDay);
  assert.deepEqual(
    [new Date(nextDay).getDate(), new Date(nextDay).getHours()],
    [22, 8],
  );
});

test("'tomorrow' honours a custom resume minute (quiet-hours end)", () => {
  const night = new Date(2026, 7, 21, 23, 0);
  const until = computeDndUntilIso("tomorrow", night, 6 * 60 + 30);

  assert.ok(until);
  assert.deepEqual([new Date(until).getHours(), new Date(until).getMinutes()], [6, 30]);
});

test("'tomorrow' keeps the wall-clock hour across a DST transition", () => {
  // Computed by mutating a local Date, so it lands on 08:00 local regardless of
  // whether the offset shifted overnight — adding 86_400_000ms would not.
  for (const [month, day] of [[2, 8], [10, 1]] as const) {
    const evening = new Date(2026, month, day, 23, 0);
    const until = computeDndUntilIso("tomorrow", evening);
    assert.ok(until);
    assert.equal(new Date(until).getHours(), 8);
  }
});

test("'tomorrow' at exactly the resume hour rolls to the next day", () => {
  const eight = new Date(2026, 7, 21, 8, 0);
  const until = computeDndUntilIso("tomorrow", eight);

  assert.ok(until);
  assert.equal(new Date(until).getDate(), 22);
});

test("formats the remaining-time pill label", () => {
  assert.equal(formatDndRemaining({ active: false, expiresAt: null, expired: false }, NOW), "off");
  assert.equal(formatDndRemaining({ active: true, expiresAt: null, expired: false }, NOW), "on");
  assert.equal(
    formatDndRemaining({ active: true, expiresAt: NOW + 25 * 60_000, expired: false }, NOW),
    "25m",
  );
  assert.equal(
    formatDndRemaining({ active: true, expiresAt: NOW + 60 * 60_000, expired: false }, NOW),
    "1h",
  );
  assert.equal(
    formatDndRemaining({ active: true, expiresAt: NOW + 95 * 60_000, expired: false }, NOW),
    "1h 35m",
  );
});
