import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { kokuDb, type TimeEntry } from "@/lib/storage/db";
import { repairTimeEntryTimestamps } from "./repair-time-entries";

beforeEach(async () => {
  await kokuDb.timeEntries.clear();
});

afterEach(async () => {
  await kokuDb.timeEntries.clear();
});

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "entry-1",
    title: "Work",
    projectId: null,
    categoryId: null,
    startAt: "2026-09-01T03:30:00.000Z",
    endAt: "2026-09-01T13:30:00.000Z",
    durationSec: 36_000,
    tags: [],
    notes: null,
    createdAt: "2026-09-01T03:30:00.000Z",
    ...overrides,
  };
}

test("fixes an entry corrupted by the old pull bug, converting raw Catalyst strings to real ISO", async () => {
  await kokuDb.timeEntries.add(entry({
    startAt: "2026-09-01 03:30:00",
    endAt: "2026-09-01 13:30:00",
    createdAt: "2026-09-01 03:30:00",
  }));

  const fixedCount = await repairTimeEntryTimestamps();
  assert.equal(fixedCount, 1);

  const fixed = await kokuDb.timeEntries.get("entry-1");
  assert.equal(fixed?.startAt, "2026-09-01T03:30:00.000Z");
  assert.equal(fixed?.endAt, "2026-09-01T13:30:00.000Z");
  assert.equal(fixed?.createdAt, "2026-09-01T03:30:00.000Z");
});

test("leaves an already-correct entry untouched and reports nothing fixed", async () => {
  await kokuDb.timeEntries.add(entry());

  const fixedCount = await repairTimeEntryTimestamps();
  assert.equal(fixedCount, 0);

  const unchanged = await kokuDb.timeEntries.get("entry-1");
  assert.equal(unchanged?.startAt, "2026-09-01T03:30:00.000Z");
});

test("fixes only the corrupted field, leaving a correct endAt alone", async () => {
  await kokuDb.timeEntries.add(entry({ startAt: "2026-09-01 03:30:00" }));

  const fixedCount = await repairTimeEntryTimestamps();
  assert.equal(fixedCount, 1);

  const fixed = await kokuDb.timeEntries.get("entry-1");
  assert.equal(fixed?.startAt, "2026-09-01T03:30:00.000Z");
  assert.equal(fixed?.endAt, "2026-09-01T13:30:00.000Z");
});

test("running the repair twice is a no-op the second time", async () => {
  await kokuDb.timeEntries.add(entry({ startAt: "2026-09-01 03:30:00" }));

  assert.equal(await repairTimeEntryTimestamps(), 1);
  assert.equal(await repairTimeEntryTimestamps(), 0);
});

test("a null endAt (still-running entry) is left as null, not misread as corrupted", async () => {
  await kokuDb.timeEntries.add(entry({ startAt: "2026-09-01 03:30:00", endAt: null }));

  const fixedCount = await repairTimeEntryTimestamps();
  assert.equal(fixedCount, 1);

  const fixed = await kokuDb.timeEntries.get("entry-1");
  assert.equal(fixed?.endAt, null);
});
