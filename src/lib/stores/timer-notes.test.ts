import assert from "node:assert/strict";
import { test } from "node:test";

import { appendTimestampedNote, formatNoteLine, parseNoteLines } from "./timer-notes";

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

test("parseNoteLines splits a timestamped blob back into stamp/text pairs", () => {
  const blob = appendTimestampedNote(appendTimestampedNote(null, "First", later), "Second", at)!;
  assert.deepEqual(parseNoteLines(blob), [
    { stamp: "09:05", text: "First" },
    { stamp: "14:32", text: "Second" },
  ]);
});

test("parseNoteLines treats an unstamped line as stamp: null", () => {
  assert.deepEqual(parseNoteLines("Plain description, no stamp"), [
    { stamp: null, text: "Plain description, no stamp" },
  ]);
});

test("parseNoteLines drops blank lines and returns [] for empty input", () => {
  assert.deepEqual(parseNoteLines("[14:32] First\n\n[09:05] Second"), [
    { stamp: "14:32", text: "First" },
    { stamp: "09:05", text: "Second" },
  ]);
  assert.deepEqual(parseNoteLines(null), []);
  assert.deepEqual(parseNoteLines(undefined), []);
  assert.deepEqual(parseNoteLines(""), []);
});
