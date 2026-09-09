import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTagStats, buildTagTotals, normalizeTag } from "@/lib/time-tracking/tag-stats";

const projectMap = new Map([
  ["p1", { id: "p1", name: "Client", color: "#ff0000" }],
]);
const categoryMap = new Map([
  ["c1", { id: "c1", name: "Delivery" }],
]);

const entries = [
  { startAt: "2026-08-20T09:00:00Z", durationSec: 3600, projectId: "p1", categoryId: "c1", tags: ["deep", "Focus"] },
  { startAt: "2026-08-18T09:00:00Z", durationSec: 1800, projectId: "p1", categoryId: null, tags: ["deep"] },
  { startAt: "2026-08-22T09:00:00Z", durationSec: 900, projectId: "gone", categoryId: "gone", tags: ["deep", "focus"] },
];

test("tag stats total time, bound the date range and split by project and category", () => {
  const stats = buildTagStats("Deep", entries, { projectMap, categoryMap });

  assert.equal(stats.tag, "deep");
  assert.equal(stats.entryCount, 3);
  assert.equal(stats.totalSec, 6300);
  assert.equal(stats.firstSeen, "2026-08-18T09:00:00Z");
  assert.equal(stats.lastSeen, "2026-08-22T09:00:00Z");

  // An entry with no project is left out of the project split rather than
  // bucketed as unknown, and a deleted project still shows its share.
  assert.deepEqual(stats.byProject, [
    { id: "p1", name: "Client", color: "#ff0000", sec: 5400 },
    { id: "gone", name: "Unknown", color: "#888", sec: 900 },
  ]);
  assert.deepEqual(stats.byCategory, [
    { id: "c1", name: "Delivery", sec: 3600 },
    { id: "gone", name: "Unknown", sec: 900 },
  ]);

  // Co-tags are normalized and never include the tag being described.
  assert.deepEqual(stats.coTags, [["focus", 2]]);
});

test("tag stats survive an empty set and a missing category lookup", () => {
  assert.deepEqual(buildTagStats("none", [], { projectMap }), {
    tag: "none",
    entryCount: 0,
    totalSec: 0,
    firstSeen: null,
    lastSeen: null,
    byProject: [],
    byCategory: [],
    coTags: [],
  });

  const stats = buildTagStats("deep", entries, { projectMap });
  assert.deepEqual(stats.byCategory.map((item) => item.name), ["Unknown", "Unknown"]);
});

test("tag totals rank by tracked time and count each entry once per tag", () => {
  const totals = buildTagTotals([
    { startAt: "2026-08-20T09:00:00Z", durationSec: 3600, tags: ["deep", "Deep", "focus"] },
    { startAt: "2026-08-21T09:00:00Z", durationSec: 1800, tags: ["focus"] },
    { startAt: "2026-08-22T09:00:00Z", durationSec: 60, tags: ["  "] },
    { startAt: "2026-08-23T09:00:00Z", tags: ["untimed"] },
  ]);

  assert.deepEqual(totals, [
    { tag: "focus", seconds: 5400, count: 2 },
    { tag: "deep", seconds: 3600, count: 1 },
    { tag: "untimed", seconds: 0, count: 1 },
  ]);
  assert.deepEqual(buildTagTotals([], 5), []);
  assert.equal(buildTagTotals([
    { startAt: "2026-08-20T09:00:00Z", durationSec: 60, tags: ["a", "b", "c"] },
  ], 2).length, 2);
});

test("normalizeTag trims and lowercases", () => {
  assert.equal(normalizeTag("  Deep Work "), "deep work");
});
