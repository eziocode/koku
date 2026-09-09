import { test } from "node:test";
import assert from "node:assert/strict";
import { adminRowsToSegmentEntries, adminTaskAccruedSec, adminUserFromDetails, calculateAdminStats, dashboardForRange, extractCatalystRowId, extractCatalystRowUserId, formatDate, formatDuration, getPresenceStatus, groupRowsByUser, pickAdminWorkSchedule, plainTextToTiptap, sortAdminUsersByPresence, tiptapToPlainText } from "@/lib/admin-data";
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/settings";

test("adapts admin rows into chart entries and drops the unusable ones", () => {
  const entries = adminRowsToSegmentEntries([
    { id: "a", title: "Bugs", startAt: "2026-08-25T09:00:00.000Z", endAt: "2026-08-25T10:00:00.000Z", durationSec: 3600, projectId: "p1", tags: ["deep", 7] },
    { id: "b", startAt: "not-a-date", durationSec: 60 },
    { startAt: "2026-08-25T11:00:00.000Z", endAt: "garbage", durationSec: "nope" },
  ]);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { id: "a", title: "Bugs", notes: null, projectId: "p1", categoryId: null, startAt: "2026-08-25T09:00:00.000Z", endAt: "2026-08-25T10:00:00.000Z", durationSec: 3600, tags: ["deep", "7"] });
  // Missing id/title fall back rather than losing real tracked work, and an
  // unparseable end reads as still-running instead of poisoning the chart.
  assert.equal(entries[1].id, "admin-row-2");
  assert.equal(entries[1].title, "Untitled work");
  assert.equal(entries[1].endAt, null);
  assert.equal(entries[1].durationSec, null);
  assert.deepEqual(entries[1].tags, []);
});

test("extracts nested and top-level Catalyst ROWID safely", () => {
  assert.equal(extractCatalystRowId({ notes_koku: { ROWID: 42 } }, "notes_koku"), 42);
  assert.equal(extractCatalystRowId({ ROWID: "abc" }, "notes_koku"), "abc");
  assert.equal(extractCatalystRowId({ notes_koku: { id: "x" } }, "notes_koku"), null);
});

test("extracts normalized Catalyst ownership from mixed row shapes", () => {
  assert.equal(extractCatalystRowUserId({ notes_koku: { user_id: " nested-user " } }, "notes_koku"), "nested-user");
  assert.equal(extractCatalystRowUserId({ notes_koku: { "notes_koku.user_id": "nested-qualified-user" } }, "notes_koku"), "nested-qualified-user");
  assert.equal(extractCatalystRowUserId({ user_id: " top-level-user " }, "notes_koku"), "top-level-user");
  assert.equal(extractCatalystRowUserId({ "notes_koku.user_id": 31247000006007476 }, "notes_koku"), "31247000006007476");
  assert.equal(extractCatalystRowUserId({ user_id: 42 }, "notes_koku"), "42");
  assert.equal(extractCatalystRowUserId({ notes_koku: { user_id: "   " } }, "notes_koku"), null);
});

test("converts TipTap content to readable plain text", () => {
  const content = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Hello" }] }, { type: "paragraph", content: [{ type: "text", text: "World" }] }] };
  assert.equal(tiptapToPlainText(content), "Hello\nWorld\n");
  assert.deepEqual(plainTextToTiptap("Hello\nWorld"), { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }, { type: "paragraph", content: [{ type: "text", text: "World" }] }] });
});

test("groups users and counts rows, including zero-record users", () => {
  const users = [{ id: "1", email: "one@example.com", displayName: "One" }, { id: "2", email: "two@example.com", displayName: "Two" }];
  assert.deepEqual(groupRowsByUser([{ userId: "1" }, { userId: "1" }], users).map((group) => [group.user.id, group.count]), [["1", 2], ["2", 0]]);
});

test("maps Catalyst user details by user ID", () => {
  assert.deepEqual(adminUserFromDetails({ user_id: "u2", email_id: "two@example.com", first_name: "Two", last_name: "User" }), {
    id: "u2", email: "two@example.com", displayName: "Two User",
  });
  assert.equal(adminUserFromDetails({ email_id: "missing@example.com" }), null);
});

test("formats durations and invalid dates without throwing", () => {
  assert.equal(formatDuration(3660), "1h 1m");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDate("not-a-date"), "not-a-date");
});

test("dashboard filters range, excludes breaks, groups projects and timelines notes", () => {
  const rows = [
    { table: "projects", id: "p1", name: "Client", color: "#ff0000" },
    { table: "timeEntries", id: "work", startAt: "2026-08-20T09:00:00Z", durationSec: 3600, projectId: "p1" },
    { table: "timeEntries", id: "break", startAt: "2026-08-20T12:00:00Z", durationSec: 1800, tags: ["break"] },
    { table: "timeEntries", id: "bad", startAt: "invalid", durationSec: 999 },
    { table: "notes", id: "note", updatedAt: "2026-08-21T12:00:00Z", content: "hello" },
  ];
  const dashboard = dashboardForRange(rows, "2026-08-20T00:00:00Z", "2026-08-21T23:59:59Z", new Date("2026-08-20T10:00:00Z"));
  assert.equal(dashboard.totalSeconds, 3600);
  assert.equal(dashboard.todaySeconds, 3600);
  assert.equal(dashboard.breakEntries.length, 1);
  assert.deepEqual(dashboard.projects, [{ id: "p1", name: "Client", color: "#ff0000", seconds: 3600 }]);
  assert.equal(dashboard.notes.length, 1);
});

test("dashboard reports break time, categories and tags alongside work", () => {
  const rows = [
    { table: "projects", id: "p1", name: "Client", color: "#ff0000" },
    { table: "categories", id: "c1", name: "Delivery", color: "#00ff00" },
    { table: "timeEntries", id: "work", startAt: "2026-08-20T09:00:00Z", durationSec: 3600, projectId: "p1", categoryId: "c1", tags: ["deep", "Deep"] },
    { table: "timeEntries", id: "other", startAt: "2026-08-20T14:00:00Z", durationSec: 1800, tags: ["admin"] },
    { table: "timeEntries", id: "break", startAt: "2026-08-20T12:00:00Z", durationSec: 900, tags: ["break"] },
  ];
  const dashboard = dashboardForRange(rows, "2026-08-20T00:00:00Z", "2026-08-21T23:59:59Z", new Date("2026-08-20T10:00:00Z"));

  // Breaks stay out of the work total but are still reported.
  assert.equal(dashboard.totalSeconds, 5400);
  assert.equal(dashboard.breakSeconds, 900);
  assert.deepEqual(dashboard.categories, [
    { id: "unassigned", name: "Uncategorized", color: "#94a3b8", seconds: 1800 },
    { id: "c1", name: "Delivery", color: "#00ff00", seconds: 3600 },
  ].sort((a, b) => b.seconds - a.seconds));
  // A tag repeated on one entry counts that entry's time once, and the break
  // tag never reaches the ranking because breaks are not work.
  assert.deepEqual(dashboard.tags, [
    { tag: "deep", seconds: 3600, count: 1 },
    { tag: "admin", seconds: 1800, count: 1 },
  ]);
});

test("stats separate break time, count auxiliary tables and running entries", () => {
  const now = Date.parse("2026-08-20T10:00:00Z");
  const rows = [
    { table: "timeEntries", id: "work", startAt: "2026-08-20T08:00:00Z", endAt: "2026-08-20T09:00:00Z", durationSec: 3600 },
    { table: "timeEntries", id: "break", startAt: "2026-08-20T09:30:00Z", endAt: "2026-08-20T09:45:00Z", durationSec: 900, tags: ["break"] },
    { table: "timeEntries", id: "live", startAt: "2026-08-20T09:50:00Z", durationSec: 0 },
    { table: "tasks", id: "t1", status: "open", accumulatedSec: 120 },
    { table: "tasks", id: "t2", status: "in_progress", accumulatedSec: 60, inProgressSince: "2026-08-20T09:59:00Z" },
    { table: "reminders", id: "r1" },
    { table: "notifications", id: "n1" },
    { table: "noteLinks", id: "l1" },
  ];
  const stats = calculateAdminStats(rows, now);

  assert.equal(stats.totalTrackedDuration, 3600);
  assert.equal(stats.breakSeconds, 900);
  assert.equal(stats.runningEntryCount, 1);
  // 120 banked, plus 60 banked and 60 seconds still running.
  assert.equal(stats.taskAccruedSec, 240);
  assert.equal(stats.reminderCount, 1);
  assert.equal(stats.notificationCount, 1);
  assert.equal(stats.noteLinkCount, 1);
});

test("task accrual reads the stopwatch off an untyped row", () => {
  const now = Date.parse("2026-08-20T10:00:00Z");
  assert.equal(adminTaskAccruedSec({ accumulatedSec: 90 }, now), 90);
  assert.equal(adminTaskAccruedSec({ accumulatedSec: 90, inProgressSince: "2026-08-20T09:59:00Z" }, now), 150);
  // A garbage or missing bank must not produce NaN in a duration label.
  assert.equal(adminTaskAccruedSec({}, now), 0);
  assert.equal(adminTaskAccruedSec({ accumulatedSec: "nope", inProgressSince: "not-a-date" }, now), 0);
});

test("work schedule exposes only the allow-listed settings", () => {
  const schedule = pickAdminWorkSchedule({
    ...NOTIFICATION_DEFAULTS,
    holidayDates: ["2026-12-25"],
    leaveDates: ["2026-11-02"],
    silentDays: [0, 6],
  });

  assert.deepEqual(schedule.holidayDates, ["2026-12-25"]);
  assert.deepEqual(schedule.leaveDates, ["2026-11-02"]);
  assert.deepEqual(schedule.silentDays, [0, 6]);
  assert.deepEqual(Object.keys(schedule).sort(), [
    "breaks", "checkIn", "enabled", "endOfDay", "holidayDates", "leaveDates", "quietHours", "silentDays",
  ]);
  // Personal preferences that live in the same settings row must not ride along.
  assert.equal("quickActions" in schedule, false);
  assert.equal("dnd" in schedule, false);
  assert.equal("sound" in schedule, false);
  // Arrays are copied, so a caller mutating the response cannot reach back into
  // the parsed preferences object.
  schedule.holidayDates.push("2026-01-01");
  assert.deepEqual(pickAdminWorkSchedule(NOTIFICATION_DEFAULTS).holidayDates, NOTIFICATION_DEFAULTS.holidayDates);
});

test("presence status favors work and breaks, expires stale heartbeats", () => {
  const seenAt = new Date(1_000_000).toISOString();
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true, work: { title: "Focus", startedAt: seenAt } }, 1_000_001), "working");
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true, break: { label: "Lunch", startedAt: seenAt } }, 1_000_001), "break");
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true }, 1_000_001), "online");
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true }, 1_000_000 + 300_001), "offline");
});

test("sorts active users by recent heartbeat before inactive users", () => {
  const now = 1_000_000;
  const user = (id: string, seenAt?: number) => ({
    id, email: `${id}@example.com`, displayName: id,
    presence: seenAt === undefined ? undefined : { seenAt: new Date(seenAt).toISOString(), visible: true, focused: true },
  });
  assert.deepEqual(sortAdminUsersByPresence([
    user("offline", now - 1_000_000),
    user("recent", now - 1_000),
    user("active", now - 10_000),
  ], now).map((item) => item.id), ["recent", "active", "offline"]);
});
