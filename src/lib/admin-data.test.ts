import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCatalystRowId, formatDate, formatDuration, groupRowsByUser, plainTextToTiptap, tiptapToPlainText } from "@/lib/admin-data";

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
