import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import test from "node:test";

import { nextTriggerAt } from "@/lib/reminders/reminders";

test("daily repeat advances by exactly one day, weekends included", () => {
  // Saturday 2026-01-03 09:00 local.
  const firedAt = new Date(2026, 0, 3, 9, 0).toISOString();
  const next = new Date(nextTriggerAt(firedAt, "daily"));
  assert.equal(next.getDay(), 0); // Sunday — not skipped.
});

test("weekly repeat advances by exactly seven days", () => {
  const firedAt = new Date(2026, 0, 3, 9, 0).toISOString();
  const next = new Date(nextTriggerAt(firedAt, "weekly"));
  assert.equal(next.getDate(), 10);
});

test("custom repeat picks the nearest upcoming selected weekday, including a weekend", () => {
  // Wednesday 2026-01-07. Selected days: Mon(1), Sat(6).
  const firedAt = new Date(2026, 0, 7, 9, 0).toISOString();
  const next = new Date(nextTriggerAt(firedAt, "custom", [1, 6]));
  assert.equal(next.getDay(), 6); // Saturday is closer than next Monday.
  assert.equal(next.getDate(), 10);
});

test("custom repeat wraps to the following week when today is the only selected day", () => {
  // Wednesday 2026-01-07, only Wednesdays selected.
  const firedAt = new Date(2026, 0, 7, 9, 0).toISOString();
  const next = new Date(nextTriggerAt(firedAt, "custom", [3]));
  assert.equal(next.getDate(), 14);
});

test("custom repeat with no days selected leaves triggerAt unchanged", () => {
  const firedAt = new Date(2026, 0, 7, 9, 0).toISOString();
  assert.equal(nextTriggerAt(firedAt, "custom", []), firedAt);
});
