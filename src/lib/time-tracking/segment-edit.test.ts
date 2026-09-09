import assert from "node:assert/strict";
import { test } from "node:test";

import { adjustSegmentsForRangeEdit } from "./segment-edit";

const entry = {
  startAt: "2024-06-03T09:00:00.000Z",
  endAt: "2024-06-03T10:30:00.000Z",
  segments: [
    { startAt: "2024-06-03T09:00:00.000Z", endAt: "2024-06-03T09:30:00.000Z" },
    { startAt: "2024-06-03T10:00:00.000Z", endAt: "2024-06-03T10:30:00.000Z" },
  ],
};

test("an edit that does not touch the range leaves the runs alone", () => {
  assert.deepEqual(adjustSegmentsForRangeEdit(entry, { }), entry.segments);
  assert.deepEqual(adjustSegmentsForRangeEdit(entry, { } as { startAt?: string }), entry.segments);
});

test("moving the range by an hour moves every run with it", () => {
  assert.deepEqual(
    adjustSegmentsForRangeEdit(entry, {
      startAt: "2024-06-03T08:00:00.000Z",
      endAt: "2024-06-03T09:30:00.000Z",
    }),
    [
      { startAt: "2024-06-03T08:00:00.000Z", endAt: "2024-06-03T08:30:00.000Z" },
      { startAt: "2024-06-03T09:00:00.000Z", endAt: "2024-06-03T09:30:00.000Z" },
    ],
  );
});

test("re-saving the same range keeps the runs untouched", () => {
  assert.deepEqual(
    adjustSegmentsForRangeEdit(entry, { startAt: entry.startAt, endAt: entry.endAt }),
    entry.segments,
  );
});

test("resizing the range drops the runs rather than inventing pause times", () => {
  assert.equal(adjustSegmentsForRangeEdit(entry, { endAt: "2024-06-03T12:00:00.000Z" }), null);
  assert.equal(adjustSegmentsForRangeEdit(entry, { startAt: "2024-06-03T08:00:00.000Z" }), null);
});

test("an entry with no end has no shift to verify, so the runs go", () => {
  assert.equal(adjustSegmentsForRangeEdit(entry, { endAt: null }), null);
  assert.equal(
    adjustSegmentsForRangeEdit({ ...entry, endAt: null }, { startAt: "2024-06-03T08:00:00.000Z" }),
    null,
  );
});

test("an unusable timestamp drops the runs instead of shifting garbage", () => {
  assert.equal(adjustSegmentsForRangeEdit(entry, { startAt: "not-a-date", endAt: "also-not" }), null);
  assert.equal(
    adjustSegmentsForRangeEdit(
      { ...entry, segments: [{ startAt: "not-a-date", endAt: "also-not" }] },
      { startAt: "2024-06-03T08:00:00.000Z", endAt: "2024-06-03T09:30:00.000Z" },
    ),
    null,
  );
});

test("an entry that never recorded runs stays without them", () => {
  assert.equal(
    adjustSegmentsForRangeEdit({ startAt: entry.startAt, endAt: entry.endAt }, { startAt: "2024-06-03T08:00:00.000Z" }),
    null,
  );
});
