import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRunRange, formatRunRanges } from "./run-format";

// Local-time literals (no `Z`) so the hour digits are timezone-independent.
const first = { startAt: "2024-06-03T11:00:00", endAt: "2024-06-03T11:30:00" };
const second = { startAt: "2024-06-03T12:20:00", endAt: "2024-06-03T13:30:00" };

test("a paused log reads as its runs, not one outer span", () => {
  assert.equal(formatRunRanges([first, second], "24h"), "11:00 → 11:30, 12:20 → 13:30");
});

test("an open run ends in the open label", () => {
  assert.equal(formatRunRange({ startAt: "2024-06-03T12:20:00" }, "24h"), "12:20 → now");
  assert.equal(
    formatRunRange({ startAt: "2024-06-03T12:20:00", endAt: null }, "24h", "running"),
    "12:20 → running",
  );
});

test("12h formatting is honoured", () => {
  assert.equal(formatRunRanges([second], "12h"), "12:20 PM → 1:30 PM");
});

test("no runs formats to nothing, so callers can fall back", () => {
  assert.equal(formatRunRanges([], "24h"), "");
  assert.equal(formatRunRanges(null, "24h"), "");
});

test("an unparseable time degrades instead of throwing", () => {
  assert.equal(formatRunRanges([{ startAt: "not-a-date", endAt: "also-not" }], "24h"), "? → ?");
});
