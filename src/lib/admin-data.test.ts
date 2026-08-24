import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardForRange, extractCatalystRowId, formatDate, formatDuration, getPresenceStatus, groupRowsByUser, plainTextToTiptap, tiptapToPlainText } from "@/lib/admin-data";

test("extracts nested and top-level Catalyst ROWID safely", () => {
  assert.equal(extractCatalystRowId({ notes_koku: { ROWID: 42 } }, "notes_koku"), 42);
  assert.equal(extractCatalystRowId({ ROWID: "abc" }, "notes_koku"), "abc");
  assert.equal(extractCatalystRowId({ notes_koku: { id: "x" } }, "notes_koku"), null);
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

test("presence status favors work and breaks, expires stale heartbeats", () => {
  const seenAt = new Date(1_000_000).toISOString();
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true, work: { title: "Focus", startedAt: seenAt } }, 1_000_001), "working");
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true, break: { label: "Lunch", startedAt: seenAt } }, 1_000_001), "break");
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true }, 1_000_001), "online");
  assert.equal(getPresenceStatus({ seenAt, visible: true, focused: true }, 1_000_000 + 300_001), "offline");
});
