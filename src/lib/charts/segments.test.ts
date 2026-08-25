import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSegmentedDays,
  deriveStatus,
  hasExcludedTag,
  toProjectBreakdown,
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

test("same-day logs with the same base colour get distinguishable segment colours", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "first", startAt: "2024-06-03T08:00:00.000Z", projectId: "p1" }),
      entry({ id: "second", startAt: "2024-06-03T09:00:00.000Z", projectId: "p1" }),
    ],
    projectMap,
  });

  assert.equal(days[0].segments.length, 2);
  assert.notEqual(days[0].segments[0].color, days[0].segments[1].color);
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

/* ─── Excluding tagged entries (breaks) ───────────────────────────────────── */

test("excludeTags removes matching entries and their seconds from the total", () => {
  // A break is a real TimeEntry so it can be audited on /log, but it must not
  // count as work in any total or it silently inflates every report.
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "work", startAt: "2026-08-21T09:00:00.000Z", projectId: "p1", durationSec: 3600 }),
      entry({ id: "lunch", startAt: "2026-08-21T12:00:00.000Z", durationSec: 1800, tags: ["break"] }),
    ],
    projectMap,
    excludeTags: ["break"],
  });

  assert.equal(days.length, 1);
  assert.deepEqual(days[0].segments.map((s) => s.id), ["work"]);
  assert.equal(days[0].totalSeconds, 3600);
  assert.equal(days[0].totalHours, 1);
});

test("omitting excludeTags preserves the previous behaviour exactly", () => {
  const entries = [
    entry({ id: "work", startAt: "2026-08-21T09:00:00.000Z", projectId: "p1", durationSec: 3600 }),
    entry({ id: "lunch", startAt: "2026-08-21T12:00:00.000Z", durationSec: 1800, tags: ["break"] }),
  ];

  const withDefault = buildSegmentedDays({ entries, projectMap });
  const withEmpty = buildSegmentedDays({ entries, projectMap, excludeTags: [] });

  assert.equal(withDefault[0].segments.length, 2);
  assert.equal(withDefault[0].totalSeconds, 5400);
  assert.deepEqual(withEmpty, withDefault);
});

test("tag matching ignores case and surrounding whitespace", () => {
  const days = buildSegmentedDays({
    entries: [entry({ id: "lunch", startAt: "2026-08-21T12:00:00.000Z", tags: [" Break "] })],
    projectMap,
    excludeTags: ["break"],
  });

  assert.equal(days[0]?.segments.length ?? 0, 0);
});

test("an entry keeps its other tags and is only excluded on a match", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({ id: "a", startAt: "2026-08-21T09:00:00.000Z", tags: ["deep", "billable"] }),
      entry({ id: "b", startAt: "2026-08-21T10:00:00.000Z", tags: ["deep", "break"] }),
    ],
    projectMap,
    excludeTags: ["break"],
  });

  assert.deepEqual(days[0].segments.map((s) => s.id), ["a"]);
});

test("hasExcludedTag is inert with an empty exclusion list", () => {
  assert.equal(
    hasExcludedTag(entry({ id: "x", startAt: "2026-08-21T09:00:00.000Z", tags: ["break"] }), []),
    false,
  );
  assert.equal(
    hasExcludedTag(entry({ id: "x", startAt: "2026-08-21T09:00:00.000Z", tags: ["break"] }), ["break"]),
    true,
  );
});

/* ─── Logs crossing midnight ──────────────────────────────────────────────── */

function localIso(value: string) {
  return new Date(value).toISOString();
}

test("a log crossing midnight is split so no day exceeds 24 h", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({
        id: "runaway",
        projectId: "p1",
        startAt: localIso("2026-08-21T09:00:00"),
        endAt: localIso("2026-08-23T00:00:00"),
        durationSec: 39 * 3600,
      }),
    ],
    projectMap,
  });

  assert.deepEqual(days.map((day) => day.key), ["2026-08-21", "2026-08-22"]);
  assert.equal(days[0].totalSeconds, 15 * 3600);
  assert.equal(days[1].totalSeconds, 24 * 3600);
  for (const day of days) {
    assert.ok(day.totalSeconds <= 24 * 3600, `${day.key} over 24 h`);
  }
});

test("split segments keep the entry id and are flagged as partial", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({
        id: "runaway",
        startAt: localIso("2026-08-21T22:00:00"),
        endAt: localIso("2026-08-22T02:00:00"),
        durationSec: 4 * 3600,
      }),
    ],
    projectMap,
  });

  const [first, second] = [days[0].segments[0], days[1].segments[0]];
  assert.notEqual(first.id, second.id, "ids must stay unique per day");
  assert.equal(first.entryId, "runaway");
  assert.equal(second.entryId, "runaway");
  assert.equal(first.continuesNextDay, true);
  assert.equal(first.continuedFromPreviousDay, false);
  assert.equal(second.continuedFromPreviousDay, true);
  assert.ok(first.isPartial && second.isPartial);
});

test("only the current day of a live timer is running", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({
        id: "live",
        status: "running",
        startAt: localIso("2026-08-21T22:00:00"),
        endAt: null,
        durationSec: 6 * 3600,
      }),
    ],
    projectMap,
  });

  assert.equal(days[0].hasRunning, false);
  assert.equal(days[0].segments[0].status, "completed");
  assert.equal(days[1].hasRunning, true);
  assert.equal(days[1].segments[0].status, "running");
});

test("an interval clips the part of a log that falls outside the window", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({
        id: "spill",
        startAt: localIso("2026-08-21T22:00:00"),
        endAt: localIso("2026-08-22T04:00:00"),
        durationSec: 6 * 3600,
      }),
    ],
    projectMap,
    interval: {
      start: new Date("2026-08-21T00:00:00"),
      end: new Date("2026-08-21T23:59:59.999"),
    },
  });

  assert.deepEqual(days.map((day) => day.key), ["2026-08-21"]);
  assert.equal(days[0].totalSeconds, 2 * 3600);
});

test("project breakdown attributes split hours to the same project once per day", () => {
  const days = buildSegmentedDays({
    entries: [
      entry({
        id: "spill",
        projectId: "p1",
        startAt: localIso("2026-08-21T22:00:00"),
        endAt: localIso("2026-08-22T02:00:00"),
        durationSec: 4 * 3600,
      }),
    ],
    projectMap,
  });

  const breakdown = toProjectBreakdown(days);
  assert.equal(breakdown.length, 1);
  assert.equal(breakdown[0].seconds, 4 * 3600);
});
