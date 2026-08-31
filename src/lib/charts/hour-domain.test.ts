import assert from "node:assert/strict";
import { test } from "node:test";

import { computeHourDomain, deriveFallbackHours, FULL_DAY_DOMAIN, rulerHoursFor } from "./hour-domain";
import type { SegmentedDay, WorkLogSegment } from "./segments";
import { NOTIFICATION_DEFAULTS, type NotificationPreferences } from "@/lib/notifications/settings";

// `startAt` is written without a `Z`/offset suffix so `new Date(...)` parses it
// as local time — the literal hour digits then match `hourOfDay`'s
// `getHours()` regardless of the machine's timezone.
function segment(partial: Partial<WorkLogSegment> & { startAt: string; hours: number }): WorkLogSegment {
  return {
    id: "s",
    entryId: "s",
    title: "Work",
    description: null,
    projectId: null,
    projectName: "Unassigned",
    categoryName: null,
    color: "#111111",
    endAt: null,
    durationSec: partial.hours * 3600,
    tags: [],
    status: "completed",
    assignment: "unassigned",
    isPartial: false,
    continuedFromPreviousDay: false,
    continuesNextDay: false,
    ...partial,
  };
}

function day(key: string, segments: WorkLogSegment[]): SegmentedDay {
  return {
    key,
    label: key,
    totalSeconds: segments.reduce((total, s) => total + s.durationSec, 0),
    totalHours: 0,
    segments,
    hasRunning: false,
    hasPaused: false,
    nonWorking: null,
  };
}

test("computeHourDomain spans the earliest start to the latest end, padded and floored/ceiled to the hour", () => {
  const days = [
    day("d1", [segment({ startAt: "2024-06-03T07:20:00", hours: 1 })]),
    day("d2", [segment({ startAt: "2024-06-04T11:00:00", hours: 2 })]),
    day("d3", [segment({ startAt: "2024-06-05T06:45:00", hours: 3 })]),
  ];

  const domain = computeHourDomain(days, FULL_DAY_DOMAIN);

  // Earliest start 6:45 -> floor to 6, pad 1 -> 5. Latest end 13:00 -> ceil to
  // 13, pad 1 -> 14.
  assert.equal(domain.start, 5);
  assert.equal(domain.end, 14);
});

test("computeHourDomain falls back when no day has a segment", () => {
  const days = [day("d1", []), day("d2", [])];
  const fallback = { start: 8, end: 18 };

  assert.deepEqual(computeHourDomain(days, fallback), fallback);
});

test("computeHourDomain enforces a minimum span for a single short log", () => {
  const days = [day("d1", [segment({ startAt: "2024-06-03T12:00:00", hours: 1 / 3 })])];

  const domain = computeHourDomain(days, FULL_DAY_DOMAIN);

  assert.ok(domain.end - domain.start >= 6, `expected span >= 6, got ${domain.end - domain.start}`);
});

test("computeHourDomain never pushes the end past 24 for a late-night log", () => {
  const days = [day("d1", [segment({ startAt: "2024-06-03T23:30:00", hours: 1 })])];

  const domain = computeHourDomain(days, FULL_DAY_DOMAIN);

  assert.ok(domain.end <= 24, `expected end <= 24, got ${domain.end}`);
  assert.ok(domain.start >= 0, `expected start >= 0, got ${domain.start}`);
});

test("rulerHoursFor always includes both domain endpoints with no duplicate hours", () => {
  const domain = { start: 5, end: 14 };

  for (const trackWidth of [0, 100, 300, 600, 1200]) {
    const hours = rulerHoursFor(domain, trackWidth);
    assert.equal(hours[0], domain.start, `trackWidth=${trackWidth}`);
    assert.equal(hours[hours.length - 1], domain.end, `trackWidth=${trackWidth}`);
    assert.equal(new Set(hours).size, hours.length, `trackWidth=${trackWidth} has duplicate hours`);
  }
});

function prefs(partial: Partial<NotificationPreferences>): NotificationPreferences {
  return { ...NOTIFICATION_DEFAULTS, ...partial };
}

test("deriveFallbackHours uses quiet-hours end and log-off time when both enabled", () => {
  const domain = deriveFallbackHours(
    prefs({
      quietHours: { ...NOTIFICATION_DEFAULTS.quietHours, enabled: true, endMinute: 8 * 60 },
      endOfDay: { ...NOTIFICATION_DEFAULTS.endOfDay, enabled: true, logoffTime: "18:00" },
    }),
  );

  assert.deepEqual(domain, { start: 8, end: 18 });
});

test("deriveFallbackHours falls back to the full day on each side independently", () => {
  const quietOnly = deriveFallbackHours(
    prefs({
      quietHours: { ...NOTIFICATION_DEFAULTS.quietHours, enabled: true, endMinute: 8 * 60 },
      endOfDay: { ...NOTIFICATION_DEFAULTS.endOfDay, enabled: false },
    }),
  );
  assert.deepEqual(quietOnly, { start: 8, end: 24 });

  const neither = deriveFallbackHours(
    prefs({
      quietHours: { ...NOTIFICATION_DEFAULTS.quietHours, enabled: false },
      endOfDay: { ...NOTIFICATION_DEFAULTS.endOfDay, enabled: false },
    }),
  );
  assert.deepEqual(neither, FULL_DAY_DOMAIN);
});

test("deriveFallbackHours falls back to the full day when the derived window is degenerate", () => {
  const domain = deriveFallbackHours(
    prefs({
      quietHours: { ...NOTIFICATION_DEFAULTS.quietHours, enabled: true, endMinute: 20 * 60 },
      endOfDay: { ...NOTIFICATION_DEFAULTS.endOfDay, enabled: true, logoffTime: "09:00" },
    }),
  );

  assert.deepEqual(domain, FULL_DAY_DOMAIN);
});
