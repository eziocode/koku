import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveQuietHours } from "./adaptive-quiet-hours";
import type { SegmentSourceEntry } from "@/lib/charts/segments";

const NOW = new Date("2024-06-20T12:00:00");
const DEFAULT_CURRENT = { startMinute: 22 * 60, endMinute: 8 * 60 };

// `startAt` is a plain (no `Z`/offset) datetime string, so `new Date(...)`
// parses it as local time and its literal hour digits match `hourOfDay`'s
// `getHours()` regardless of the test machine's timezone. Built by hand,
// rather than via `Date#toISOString` (which always normalizes to UTC and
// would shift the hour on any non-UTC machine).
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

test("deriveQuietHours returns null with fewer than 5 days of logs", () => {
  const entries = [
    entry("a", "2024-06-16", 9, 8),
    entry("b", "2024-06-17", 9, 8),
    entry("c", "2024-06-18", 9, 8),
  ];

  assert.equal(deriveQuietHours(entries, DEFAULT_CURRENT, NOW), null);
});

test("deriveQuietHours proposes a window from the median start/end across 5+ days", () => {
  const entries = [
    entry("a", "2024-06-14", 9, 8), // 9:00 - 17:00
    entry("b", "2024-06-15", 9, 8),
    entry("c", "2024-06-16", 9, 8),
    entry("d", "2024-06-17", 9, 8),
    entry("e", "2024-06-18", 9, 8),
  ];

  const result = deriveQuietHours(entries, { startMinute: 20 * 60, endMinute: 5 * 60 }, NOW);

  assert.ok(result, "expected a proposal");
  // Median start 9:00 - 60min buffer -> 8:00. Median end 17:00 + 60min -> 18:00.
  assert.equal(result!.endMinute, 8 * 60);
  assert.equal(result!.startMinute, 18 * 60);
});

test("deriveQuietHours ignores an outlier all-nighter via the median", () => {
  const entries = [
    entry("a", "2024-06-14", 9, 8),
    entry("b", "2024-06-15", 9, 8),
    entry("c", "2024-06-16", 9, 8),
    entry("d", "2024-06-17", 9, 8),
    entry("e", "2024-06-18", 0, 20), // an all-nighter: starts midnight, runs 20h
  ];

  const result = deriveQuietHours(entries, { startMinute: 20 * 60, endMinute: 5 * 60 }, NOW);

  assert.ok(result);
  // Median of [9,9,9,9,0] is 9 — the single 0 doesn't move it.
  assert.equal(result!.endMinute, 8 * 60);
});

test("deriveQuietHours returns null when the proposal is within 30 minutes of current", () => {
  const entries = [
    entry("a", "2024-06-14", 9, 8),
    entry("b", "2024-06-15", 9, 8),
    entry("c", "2024-06-16", 9, 8),
    entry("d", "2024-06-17", 9, 8),
    entry("e", "2024-06-18", 9, 8),
  ];

  // Proposal would be start=18:00, end=8:00 — already within 30 minutes of both.
  const result = deriveQuietHours(entries, { startMinute: 18 * 60 + 10, endMinute: 8 * 60 - 10 }, NOW);

  assert.equal(result, null);
});

test("deriveQuietHours ignores entries tagged as breaks", () => {
  const entries = [
    entry("a", "2024-06-14", 9, 8),
    entry("b", "2024-06-15", 9, 8),
    entry("c", "2024-06-16", 9, 8),
    entry("d", "2024-06-17", 9, 8),
    entry("e", "2024-06-18", 9, 8),
    { ...entry("f", "2024-06-18", 22, 1), tags: ["break"] }, // late break, would skew the end
  ];

  const result = deriveQuietHours(entries, { startMinute: 20 * 60, endMinute: 5 * 60 }, NOW);

  assert.ok(result);
  assert.equal(result!.startMinute, 18 * 60);
});

test("deriveQuietHours ignores entries outside the 30-day lookback", () => {
  const entries = [
    entry("a", "2024-06-14", 9, 8),
    entry("b", "2024-06-15", 9, 8),
    entry("c", "2024-06-16", 9, 8),
    entry("d", "2024-06-17", 9, 8),
    entry("old1", "2024-04-01", 3, 1),
    entry("old2", "2024-04-02", 3, 1),
  ];

  // Only 4 days fall inside the lookback window — not enough signal.
  assert.equal(deriveQuietHours(entries, DEFAULT_CURRENT, NOW), null);
});
