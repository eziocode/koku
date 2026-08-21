import assert from "node:assert/strict";
import { test } from "node:test";

import { appendTimestampedNote, formatNoteLine } from "./timer-notes";

const at = new Date(2026, 7, 21, 14, 32);
const later = new Date(2026, 7, 21, 9, 5);

test("formats a line as local HH:mm, zero-padded", () => {
  assert.equal(formatNoteLine("Reviewed the API diff", at), "[14:32] Reviewed the API diff");
  assert.equal(formatNoteLine("Early start", later), "[09:05] Early start");
});

test("appends to an empty note without a leading newline", () => {
  assert.equal(appendTimestampedNote(null, "First", at), "[14:32] First");
  assert.equal(appendTimestampedNote("", "First", at), "[14:32] First");
  assert.equal(appendTimestampedNote(undefined, "First", at), "[14:32] First");
});

test("appends to existing content in order, newline-joined", () => {
  const first = appendTimestampedNote(null, "First", later);
  const second = appendTimestampedNote(first, "Second", at);

  assert.equal(second, "[09:05] First\n[14:32] Second");
});

test("does not double up whitespace when existing content has a trailing newline", () => {
  assert.equal(appendTimestampedNote("Existing note\n", "Added", at), "Existing note\n[14:32] Added");
  assert.equal(appendTimestampedNote("Existing note   ", "Added", at), "Existing note\n[14:32] Added");
});

test("empty or whitespace-only input leaves the note untouched", () => {
  assert.equal(appendTimestampedNote("Existing", "", at), "Existing");
  assert.equal(appendTimestampedNote("Existing", "   ", at), "Existing");
  assert.equal(appendTimestampedNote(null, "  ", at), null);
});

test("trims the note text itself", () => {
  assert.equal(appendTimestampedNote(null, "  padded  ", at), "[14:32] padded");
});
