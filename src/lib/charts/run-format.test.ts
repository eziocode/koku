import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeRuns, formatRunLog, formatRunRange, formatRunRanges } from "./run-format";

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

test("a paused run's log names every pause and resume", () => {
  assert.deepEqual(
    formatRunLog([first, second], "24h").map((event) => [event.time, event.label, event.kind]),
    [
      ["11:00", "Started", "start"],
      ["11:30", "Paused", "pause"],
      ["12:20", "Resumed", "resume"],
      ["13:30", "Stopped", "stop"],
    ],
  );
});

test("each log line carries the stretch it closes off", () => {
  const events = formatRunLog([first, second], "24h");
  assert.equal(events[0].spanSec, undefined);
  assert.equal(events[1].spanSec, 30 * 60, "the run that just ended");
  assert.equal(events[2].spanSec, 50 * 60, "the pause that just ended");
  assert.equal(events[3].spanSec, 70 * 60);
});

test("an unpaused run logs as a plain start and stop", () => {
  assert.deepEqual(
    formatRunLog([first], "12h").map((event) => `${event.time} ${event.label}`),
    ["11:00 AM Started", "11:30 AM Stopped"],
  );
});

test("an open final run closes on the running marker, not a bare start", () => {
  assert.deepEqual(
    formatRunLog([first, { startAt: "2024-06-03T12:20:00", endAt: null }], "24h").map(
      (event) => `${event.time} ${event.label}`,
    ),
    ["11:00 Started", "11:30 Paused", "12:20 Resumed", "now Running"],
  );
});

test("the stopped and running labels are overridable", () => {
  const events = formatRunLog([{ startAt: "2024-06-03T12:20:00" }], "24h", "Ended", "In progress");
  assert.deepEqual(events.map((event) => event.label), ["Started", "In progress"]);
  assert.deepEqual(
    formatRunLog([first], "24h", "Ended").map((event) => event.label),
    ["Started", "Ended"],
  );
});

test("no runs logs nothing, so callers can fall back to the outer span", () => {
  assert.deepEqual(formatRunLog([], "24h"), []);
  assert.deepEqual(formatRunLog(null, "24h"), []);
});


test("session summary separates elapsed range from paused duration", () => {
  assert.deepEqual(summarizeRuns([first, second], "24h"), {
    range: "11:00 → 13:30", pauseCount: 1, pausedSec: 3000,
  });
  assert.deepEqual(summarizeRuns([first], "12h"), {
    range: "11:00 AM → 11:30 AM", pauseCount: 0, pausedSec: 0,
  });
  assert.equal(summarizeRuns([], "24h"), null);
});

test("summary preserves seconds and sums many gaps", () => {
  const runs = Array.from({ length: 101 }, (_, index) => ({
    startAt: new Date(Date.UTC(2024, 5, 3, 10, 0, index * 11)).toISOString(),
    endAt: new Date(Date.UTC(2024, 5, 3, 10, 0, index * 11 + 10)).toISOString(),
  }));
  const summary = summarizeRuns(runs, "24h");
  assert.equal(summary?.pauseCount, 100);
  assert.equal(summary?.pausedSec, 100);
});

test("summary supports open sessions and zero-length gaps", () => {
  const summary = summarizeRuns([first, { startAt: first.endAt }], "24h");
  assert.equal(summary?.range, "11:00 → Running");
  assert.equal(summary?.pausedSec, 0);
});

test("summary never reports a partial pause total as complete", () => {
  for (const startAt of ["invalid", "2024-06-03T11:00:00"]) {
    assert.equal(summarizeRuns([first, { startAt }], "24h")?.pausedSec, null);
  }
  assert.equal(summarizeRuns([{ startAt: first.startAt }, second], "24h")?.pausedSec, null);
  assert.equal(summarizeRuns([{ startAt: "invalid", endAt: "invalid" }], "24h")?.range, "? → ?");
});
