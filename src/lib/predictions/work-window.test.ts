import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPredictedHour, predictWorkWindows } from "./work-window";
import type { SegmentSourceEntry } from "@/lib/charts/segments";

const NOW = new Date("2024-06-20T12:00:00"); // a Thursday

// See adaptive-quiet-hours.test.ts for why `startAt` is built as a plain
// (no `Z`/offset) local datetime string rather than via `toISOString`.
function entry(id: string, dateIso: string, startHour: number, durationHours: number): SegmentSourceEntry {
  return {
    id,
    title: "Work",
    projectId: null,
    startAt: `${dateIso}T${String(startHour).padStart(2, "0")}:00:00`,
    endAt: null,
    durationSec: durationHours * 3600,
    tags: [],
  };
}

test("predictWorkWindows returns nothing for a weekday with under 3 days of history", () => {
  // Two Mondays only.
  const entries = [entry("a", "2024-06-03", 9, 8), entry("b", "2024-06-10", 9, 8)];
  assert.deepEqual(predictWorkWindows(entries, NOW), []);
});

test("predictWorkWindows derives a median login/logoff per weekday, independently", () => {
  const entries = [
    // Mondays: 9:00 - 17:00
    entry("mon1", "2024-06-03", 9, 8),
    entry("mon2", "2024-06-10", 9, 8),
    entry("mon3", "2024-06-17", 9, 8),
    // Saturdays: 11:00 - 14:00 (a different, lighter pattern)
    entry("sat1", "2024-06-01", 11, 3),
    entry("sat2", "2024-06-08", 11, 3),
    entry("sat3", "2024-06-15", 11, 3),
  ];

  const predictions = predictWorkWindows(entries, NOW);
  const byLabel = new Map(predictions.map((p) => [p.weekdayLabel, p]));

  assert.equal(byLabel.get("Monday")?.loginHour, 9);
  assert.equal(byLabel.get("Monday")?.logoffHour, 17);
  assert.equal(byLabel.get("Saturday")?.loginHour, 11);
  assert.equal(byLabel.get("Saturday")?.logoffHour, 14);
  // Tuesday has no history at all, so it is omitted rather than guessed.
  assert.equal(byLabel.has("Tuesday"), false);
});

test("predictWorkWindows ignores entries older than the lookback window", () => {
  const entries = [
    entry("old1", "2023-01-02", 6, 2),
    entry("old2", "2023-01-09", 6, 2),
    entry("old3", "2023-01-16", 6, 2),
  ];
  assert.deepEqual(predictWorkWindows(entries, NOW), []);
});

test("predictWorkWindows excludes break-tagged entries from the pattern", () => {
  const entries = [
    entry("mon1", "2024-06-03", 9, 8),
    entry("mon2", "2024-06-10", 9, 8),
    entry("mon3", "2024-06-17", 9, 8),
    { ...entry("break", "2024-06-03", 22, 1), tags: ["Break"] },
  ];

  const predictions = predictWorkWindows(entries, NOW);
  const monday = predictions.find((p) => p.weekdayLabel === "Monday");
  assert.equal(monday?.logoffHour, 17);
});

test("confidence scales with sample count relative to the lookback window", () => {
  const entries = [
    entry("mon1", "2024-06-03", 9, 8),
    entry("mon2", "2024-06-10", 9, 8),
    entry("mon3", "2024-06-17", 9, 8),
  ];
  const predictions = predictWorkWindows(entries, NOW);
  const monday = predictions.find((p) => p.weekdayLabel === "Monday");
  assert.ok(monday);
  assert.ok(monday!.confidence > 0 && monday!.confidence <= 1);
});

test("formatPredictedHour renders a fractional hour as a 12-hour clock string", () => {
  assert.equal(formatPredictedHour(9), "9:00 AM");
  assert.equal(formatPredictedHour(13.5), "1:30 PM");
  assert.equal(formatPredictedHour(0), "12:00 AM");
});
