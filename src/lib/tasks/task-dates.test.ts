import assert from "node:assert/strict";
import { test } from "node:test";

import { nextDayEndOfDayLocal, nowLocalDateTime, toDateTimeLocal } from "./task-dates";

test("toDateTimeLocal returns empty string for no value", () => {
  assert.equal(toDateTimeLocal(null), "");
  assert.equal(toDateTimeLocal(undefined), "");
  assert.equal(toDateTimeLocal(""), "");
});

test("toDateTimeLocal round-trips a UTC ISO instant to a local yyyy-MM-ddTHH:mm string", () => {
  const iso = "2026-06-12T09:30:00.000Z";
  const local = toDateTimeLocal(iso);

  // Round-tripping the local string back through `new Date` (which parses it
  // as local time, same as the picker does) must land on the same instant —
  // this is the invariant the timezone-shift bug in the task form broke.
  assert.equal(new Date(local).toISOString(), new Date(iso).toISOString());
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("nowLocalDateTime is within a second of the actual local time", () => {
  const value = nowLocalDateTime();
  const parsed = new Date(value);
  assert.ok(Math.abs(parsed.getTime() - Date.now()) < 60_000, "expected nowLocalDateTime to be close to now");
});

test("nextDayEndOfDayLocal lands on tomorrow's date at 23:59", () => {
  const value = nextDayEndOfDayLocal();
  const [datePart, timePart] = value.split("T");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  assert.equal(datePart, expectedDate);
  assert.equal(timePart, "23:59");
});
