import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSegmentedDays,
  deriveStatus,
  toProjectBreakdown,
  toStackedRows,
  toStatusBreakdown,
  type SegmentSourceEntry,
} from "./segments";

const projectMap = new Map([
  ["p1", { id: "p1", name: "Website", color: "#111111" }],
  ["p2", { id: "p2", name: "App", color: "#222222" }],
]);

function entry(partial: Partial<SegmentSourceEntry> & { id: string; startAt: string }): SegmentSourceEntry {
  return {
    title: "Work",
    projectId: null,
    endAt: null,
    durationSec: 3600,
    tags: [],
    notes: null,
    ...partial,
  };
}

test("buildSegmentedDays groups multiple logs into one day as separate segments", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1", durationSec: 3600 }),
      entry({ id: "b", startAt: "2024-06-03T11:00:00.000Z", projectId: "p2", durationSec: 1800 }),
    ],
    projectMap,
  });

  assert.equal(days.length, 1);
  assert.equal(days[0].segments.length, 2);
  assert.equal(days[0].totalSeconds, 5400);
  assert.equal(days[0].totalHours, 1.5);
});

test("segments are ordered chronologically and carry project colour", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "late", startAt: "2024-06-03T15:00:00.000Z", projectId: "p2" }),
      entry({ id: "early", startAt: "2024-06-03T08:00:00.000Z", projectId: "p1" }),
    ],
    projectMap,
  });

  assert.deepEqual(
    days[0].segments.map((s) => s.id),
    ["early", "late"],
  );
  assert.equal(days[0].segments[0].color, "#111111");
  assert.equal(days[0].segments[0].projectName, "Website");
});

test("unassigned entries get the neutral colour and Unassigned name", () => {
  const days = buildSegmentedDays({
    entries: [entry({ id: "x", startAt: "2024-06-03T08:00:00.000Z", projectId: null })],
    projectMap,
  });
  assert.equal(days[0].segments[0].projectName, "Unassigned");
});

test("interval emits empty days to keep the axis continuous", () => {
  const days = buildSegmentedDays({
    entries: [entry({ id: "x", startAt: "2024-06-02T08:00:00.000Z" })],
    projectMap,
    interval: { start: new Date("2024-06-01T00:00:00"), end: new Date("2024-06-03T00:00:00") },
  });
  assert.equal(days.length, 3);
  assert.equal(days.filter((d) => d.segments.length === 0).length, 2);
});

test("invalid start dates are skipped", () => {
  const days = buildSegmentedDays({
    entries: [entry({ id: "bad", startAt: "not-a-date" })],
    projectMap,
  });
  assert.equal(days.length, 0);
});

test("toStackedRows produces one row per day and reports max segment count", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1" }),
      entry({ id: "b", startAt: "2024-06-03T11:00:00.000Z", projectId: "p2", durationSec: 1800 }),
      entry({ id: "c", startAt: "2024-06-04T09:00:00.000Z", projectId: "p1" }),
    ],
    projectMap,
  });
  const { rows, maxSegments } = toStackedRows(days);
  assert.equal(rows.length, 2);
  assert.equal(maxSegments, 2);
  const twoSegRow = rows.find((r) => r.segments.length === 2);
  assert.ok(twoSegRow);
  assert.equal(twoSegRow.seg0, 1);
  assert.equal(twoSegRow.seg1, 0.5);
});

test("toStackedRows marks the topmost segment per row and leaves shorter days undefined", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1" }),
      entry({ id: "b", startAt: "2024-06-03T11:00:00.000Z", projectId: "p2", durationSec: 1800 }),
      entry({ id: "c", startAt: "2024-06-04T09:00:00.000Z", projectId: "p1" }),
    ],
    projectMap,
  });
  const { rows } = toStackedRows(days);
  const twoSegRow = rows.find((r) => r.segments.length === 2);
  const oneSegRow = rows.find((r) => r.segments.length === 1);
  assert.ok(twoSegRow && oneSegRow);
  // Each row's top index reflects its own segment count, not the global max.
  assert.equal(twoSegRow.topSegmentIndex, 1);
  assert.equal(oneSegRow.topSegmentIndex, 0);
  // The shorter day has no seg1 value.
  assert.equal(oneSegRow.seg1, undefined);
});

test("category name resolves via categoryMap when present", () => {
  const categoryMap = new Map([["c1", { id: "c1", name: "Deep work" }]]);
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1", categoryId: "c1" }),
    ],
    projectMap,
    categoryMap,
  });
  assert.equal(days[0].segments[0].categoryName, "Deep work");
});

test("labelFormat controls axis label (weekday vs date)", () => {
  const weekday = buildSegmentedDays({
    entries: [entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z" })],
    projectMap,
    labelFormat: "weekday",
  });
  const dated = buildSegmentedDays({
    entries: [entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z" })],
    projectMap,
    labelFormat: "date",
  });
  assert.match(weekday[0].label, /^[A-Z][a-z]{2}$/); // e.g. "Mon"
  assert.match(dated[0].label, /^[A-Z][a-z]{2} \d{1,2}$/); // e.g. "Jun 3"
});

test("toProjectBreakdown aggregates seconds per project, sorted desc", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1", durationSec: 3600 }),
      entry({ id: "b", startAt: "2024-06-04T09:00:00.000Z", projectId: "p2", durationSec: 7200 }),
      entry({ id: "c", startAt: "2024-06-05T09:00:00.000Z", projectId: "p1", durationSec: 1800 }),
    ],
    projectMap,
  });
  const breakdown = toProjectBreakdown(days);
  assert.equal(breakdown.length, 2);
  assert.equal(breakdown[0].name, "App");
  assert.equal(breakdown[0].seconds, 7200);
  assert.equal(breakdown[1].seconds, 5400);
});

test("deriveStatus infers running / completed / pending, honouring explicit status", () => {
  assert.equal(deriveStatus(entry({ id: "r", startAt: "x", endAt: null })), "running");
  assert.equal(
    deriveStatus(entry({ id: "c", startAt: "x", endAt: "y", durationSec: 3600 })),
    "completed",
  );
  assert.equal(
    deriveStatus(entry({ id: "p", startAt: "x", endAt: "y", durationSec: 0 })),
    "pending",
  );
  assert.equal(
    deriveStatus(entry({ id: "f", startAt: "x", endAt: "y", status: "failed" })),
    "failed",
  );
});

test("running segments get a minimum visible height and flag the day", () => {
  const days = buildSegmentedDays({
    entries: [entry({ id: "run", startAt: "2024-06-03T09:00:00.000Z", endAt: null, durationSec: 0 })],
    projectMap,
  });
  assert.equal(days[0].hasRunning, true);
  assert.equal(days[0].segments[0].status, "running");
  assert.ok(days[0].segments[0].hours > 0, "running log should have a visible height");
});

test("segments carry assignment state (assigned vs unassigned)", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1" }),
      entry({ id: "b", startAt: "2024-06-03T10:00:00.000Z", projectId: null }),
    ],
    projectMap,
  });
  const byId = Object.fromEntries(days[0].segments.map((s) => [s.id, s.assignment]));
  assert.equal(byId.a, "assigned");
  assert.equal(byId.b, "unassigned");
});

test("toStatusBreakdown aggregates status + assignment counts", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1", endAt: "2024-06-03T10:00:00.000Z", durationSec: 3600 }),
      entry({ id: "b", startAt: "2024-06-03T11:00:00.000Z", projectId: "p2", endAt: null, durationSec: 0 }),
      entry({ id: "c", startAt: "2024-06-04T09:00:00.000Z", projectId: null, endAt: "2024-06-04T10:00:00.000Z", durationSec: 3600 }),
    ],
    projectMap,
  });
  const { status, assignment } = toStatusBreakdown(days, (key) => key);

  const completed = status.find((s) => s.key === "completed");
  const running = status.find((s) => s.key === "running");
  assert.equal(completed?.count, 2);
  assert.equal(running?.count, 1);

  const assigned = assignment.find((s) => s.key === "assigned");
  const unassigned = assignment.find((s) => s.key === "unassigned");
  assert.equal(assigned?.count, 2);
  assert.equal(unassigned?.count, 1);
  // status slices are ordered completed → running → pending → failed
  assert.deepEqual(status.map((s) => s.key), ["completed", "running"]);
});
