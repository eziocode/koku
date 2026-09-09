import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_HOLIDAY_DATES,
  MAX_LEAVE_DATES,
  isHolidayDate,
  isLeaveDate,
  normalizeHolidayDates,
  normalizeLeaveDates,
  notificationPreferencesSchema,
  toHolidayDateKey,
  toggleHolidayDate,
  toggleLeaveDate,
} from "./settings";

test("a date key is the local calendar day, not the UTC one", () => {
  // 00:30 local on the 2nd is still the 2nd, whatever UTC calls it.
  const local = new Date(2026, 7, 2, 0, 30, 0);
  assert.equal(toHolidayDateKey(local), "2026-08-02");
});

test("normalising sorts, de-duplicates, and drops nonsense", () => {
  assert.deepEqual(
    normalizeHolidayDates(["2026-08-02", "2026-01-01", "2026-08-02", "", "not-a-date", "2026-13-40"]),
    ["2026-01-01", "2026-08-02"],
  );
});

test("normalising caps the list rather than letting it grow without bound", () => {
  const many = Array.from({ length: MAX_HOLIDAY_DATES + 20 }, (_value, index) => {
    const day = new Date(2026, 0, 1 + index);
    return toHolidayDateKey(day);
  });

  const normalized = normalizeHolidayDates(many);
  assert.equal(normalized.length, MAX_HOLIDAY_DATES);
  // The cap keeps the most recent dates: an old holiday is the one worth losing.
  assert.equal(normalized.at(-1), many.at(-1));
});

test("toggling adds a missing date and removes a present one", () => {
  const added = toggleHolidayDate([], "2026-08-02");
  assert.deepEqual(added, ["2026-08-02"]);
  assert.deepEqual(toggleHolidayDate(added, "2026-08-02"), []);
});

test("a holiday is matched by local day, at any time of that day", () => {
  const dates = ["2026-08-02"];
  assert.equal(isHolidayDate(dates, new Date(2026, 7, 2, 0, 0, 0)), true);
  assert.equal(isHolidayDate(dates, new Date(2026, 7, 2, 23, 59, 59)), true);
  assert.equal(isHolidayDate(dates, new Date(2026, 7, 3, 0, 0, 0)), false);
});

test("preferences default to no holidays and survive a corrupt list", () => {
  assert.deepEqual(notificationPreferencesSchema.parse({}).holidayDates, []);
  assert.deepEqual(
    notificationPreferencesSchema.parse({ holidayDates: ["2026-08-02", 7, null] }).holidayDates,
    [],
    "a list with a non-string member falls back rather than half-parsing",
  );
  assert.deepEqual(
    notificationPreferencesSchema.parse({ holidayDates: ["2026-08-03", "2026-08-02"] }).holidayDates,
    ["2026-08-02", "2026-08-03"],
  );
});

test("leave dates normalize, cap, toggle, and match the same way as holidays", () => {
  assert.deepEqual(
    normalizeLeaveDates(["2026-08-02", "2026-01-01", "2026-08-02", "", "not-a-date"]),
    ["2026-01-01", "2026-08-02"],
  );

  const many = Array.from({ length: MAX_LEAVE_DATES + 20 }, (_value, index) => {
    const day = new Date(2027, 0, 1 + index);
    return toHolidayDateKey(day);
  });
  assert.equal(normalizeLeaveDates(many).length, MAX_LEAVE_DATES);

  const added = toggleLeaveDate([], "2027-03-10");
  assert.deepEqual(added, ["2027-03-10"]);
  assert.deepEqual(toggleLeaveDate(added, "2027-03-10"), []);

  assert.equal(isLeaveDate(["2027-03-10"], new Date(2027, 2, 10, 23, 59, 59)), true);
  assert.equal(isLeaveDate(["2027-03-10"], new Date(2027, 2, 11, 0, 0, 0)), false);
});

test("leave dates allow future dates and default to empty, unlike a corrupt list", () => {
  assert.deepEqual(notificationPreferencesSchema.parse({}).leaveDates, []);
  const future = "2099-01-01";
  assert.deepEqual(
    notificationPreferencesSchema.parse({ leaveDates: [future] }).leaveDates,
    [future],
  );
  assert.deepEqual(
    notificationPreferencesSchema.parse({ leaveDates: [future, 7, null] }).leaveDates,
    [],
    "a list with a non-string member falls back rather than half-parsing",
  );
});
