import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  clampDurationMinutes,
  formatDurationLabel,
  formatResolvedAt,
  fromMinutes,
  isValidDurationAmount,
  resolveDurationIso,
  toMinutes,
} from "./duration-presets";

test("hours convert to whole minutes and round-trip", () => {
  assert.equal(toMinutes(2, "hr"), 120);
  assert.equal(toMinutes(2, "min"), 2);
  assert.deepEqual(fromMinutes(120), { amount: 2, unit: "hr" });
  assert.deepEqual(fromMinutes(toMinutes(3, "hr")), { amount: 3, unit: "hr" });
  assert.deepEqual(fromMinutes(toMinutes(45, "min")), { amount: 45, unit: "min" });
});

test("a non-whole hour stays in minutes so a whole-number stepper can edit it", () => {
  assert.deepEqual(fromMinutes(90), { amount: 90, unit: "min" });
  assert.deepEqual(fromMinutes(59), { amount: 59, unit: "min" });
  assert.deepEqual(fromMinutes(60), { amount: 1, unit: "hr" });
});

test("clamping holds both bounds and survives garbage", () => {
  assert.equal(clampDurationMinutes(0), MIN_DURATION_MINUTES);
  assert.equal(clampDurationMinutes(-5), MIN_DURATION_MINUTES);
  assert.equal(clampDurationMinutes(MAX_DURATION_MINUTES + 1), MAX_DURATION_MINUTES);
  assert.equal(clampDurationMinutes(300, 240), 240);
  assert.equal(clampDurationMinutes(Number.NaN), MIN_DURATION_MINUTES);
  assert.equal(clampDurationMinutes(Number.POSITIVE_INFINITY), MIN_DURATION_MINUTES);
});

test("validity follows the surface's own cap", () => {
  assert.equal(isValidDurationAmount(4, "hr", 240), true);
  assert.equal(isValidDurationAmount(5, "hr", 240), false);
  assert.equal(isValidDurationAmount(0, "min", 240), false);
  assert.equal(isValidDurationAmount(1.5, "min", 240), false);
  assert.equal(isValidDurationAmount(Number.NaN, "min", 240), false);
});

test("resolving is exact elapsed-time addition against the injected now", () => {
  const now = new Date("2026-09-03T14:00:00.000Z");

  assert.equal(resolveDurationIso(2, now), "2026-09-03T14:02:00.000Z");
  assert.equal(resolveDurationIso(90, now), "2026-09-03T15:30:00.000Z");
  assert.equal(now.toISOString(), "2026-09-03T14:00:00.000Z", "now must not be mutated");
});

test("the hint renders in the caller's time format", () => {
  // Built from local parts so the assertion holds in any TZ the suite runs in.
  const now = new Date(2026, 8, 3, 16, 0, 0);

  assert.match(formatResolvedAt(25, now, "24h"), /^16:25$/);
  assert.match(formatResolvedAt(25, now, "12h"), /^4:25\s?PM$/i);
});

test("the hint says tomorrow when the duration crosses midnight", () => {
  const late = new Date(2026, 8, 3, 23, 50, 0);

  assert.match(formatResolvedAt(20, late, "24h"), /^00:10 tomorrow$/);
  assert.match(formatResolvedAt(20, late, "12h"), /tomorrow$/);
  assert.doesNotMatch(formatResolvedAt(5, late, "24h"), /tomorrow/);
});

test("labels read naturally at every scale", () => {
  assert.equal(formatDurationLabel(2), "2 min");
  assert.equal(formatDurationLabel(59), "59 min");
  assert.equal(formatDurationLabel(60), "1 hr");
  assert.equal(formatDurationLabel(90), "1 hr 30 min");
  assert.equal(formatDurationLabel(240), "4 hr");
});
