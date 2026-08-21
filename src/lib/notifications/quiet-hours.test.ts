import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isWithinQuietHours,
  minutesToTimeInput,
  timeInputToMinutes,
  toMinuteOfDay,
} from "./quiet-hours";

/* Local time throughout — quiet hours are a human-clock concept, so these use
   local Date construction rather than UTC parsing. */
function at(hours: number, minutes = 0) {
  return new Date(2026, 7, 21, hours, minutes);
}

const overnight = { startMinute: 22 * 60, endMinute: 8 * 60 };
const daytime = { startMinute: 9 * 60, endMinute: 17 * 60 };

test("a window that wraps past midnight covers both sides of it", () => {
  assert.equal(isWithinQuietHours(at(23), overnight), true);
  assert.equal(isWithinQuietHours(at(2), overnight), true);
  assert.equal(isWithinQuietHours(at(12), overnight), false);
  assert.equal(isWithinQuietHours(at(21, 59), overnight), false);
});

test("wrapping window boundaries are inclusive at the start, exclusive at the end", () => {
  assert.equal(isWithinQuietHours(at(22), overnight), true);
  assert.equal(isWithinQuietHours(at(7, 59), overnight), true);
  assert.equal(isWithinQuietHours(at(8), overnight), false);
});

test("a same-day window behaves normally", () => {
  assert.equal(isWithinQuietHours(at(12), daytime), true);
  assert.equal(isWithinQuietHours(at(9), daytime), true);
  assert.equal(isWithinQuietHours(at(17), daytime), false);
  assert.equal(isWithinQuietHours(at(3), daytime), false);
});

test("a zero-width window means no quiet hours, not all day", () => {
  const zero = { startMinute: 9 * 60, endMinute: 9 * 60 };

  assert.equal(isWithinQuietHours(at(9), zero), false);
  assert.equal(isWithinQuietHours(at(3), zero), false);
  assert.equal(isWithinQuietHours(at(21), zero), false);
});

test("converts between minutes and time-input strings", () => {
  assert.equal(minutesToTimeInput(0), "00:00");
  assert.equal(minutesToTimeInput(22 * 60), "22:00");
  assert.equal(minutesToTimeInput(8 * 60 + 5), "08:05");

  assert.equal(timeInputToMinutes("22:00"), 22 * 60);
  assert.equal(timeInputToMinutes("8:05"), 8 * 60 + 5);
  assert.equal(timeInputToMinutes(" 09:30 "), 9 * 60 + 30);
});

test("rejects malformed and out-of-range time inputs", () => {
  assert.equal(timeInputToMinutes(""), null);
  assert.equal(timeInputToMinutes("24:00"), null);
  assert.equal(timeInputToMinutes("09:60"), null);
  assert.equal(timeInputToMinutes("nine"), null);
  assert.equal(timeInputToMinutes("0930"), null);
});

test("toMinuteOfDay reads local wall-clock minutes", () => {
  assert.equal(toMinuteOfDay(at(0)), 0);
  assert.equal(toMinuteOfDay(at(14, 32)), 14 * 60 + 32);
});
