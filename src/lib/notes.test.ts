import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildQuickNoteDoc,
  buildQuickNoteStamp,
  buildQuickNoteTitle,
  QUICK_NOTE_NOTE_TAG,
  type QuickNoteOrigin,
} from "./notes";

const AT = new Date(2026, 7, 23, 14, 32);
const elapsed = (seconds: number) => `${Math.round(seconds / 60)}m`;

function origin(overrides: Partial<QuickNoteOrigin> = {}): QuickNoteOrigin {
  return { kind: "standalone", label: null, elapsedSec: null, ...overrides };
}

/* ─── Titles ──────────────────────────────────────────────────────────────── */

test("the title is the note itself, so the notes list stays scannable", () => {
  assert.equal(buildQuickNoteTitle("  Shipped the  badge fix  "), "Shipped the badge fix");
});

test("a long note is truncated rather than filling the list", () => {
  const title = buildQuickNoteTitle("a".repeat(200));
  assert.equal(title.length, 60);
  assert.ok(title.endsWith("…"));
});

test("an empty note still gets a title rather than an untitled slug", () => {
  assert.equal(buildQuickNoteTitle("   "), "Quick note");
});

/* ─── Stamp ───────────────────────────────────────────────────────────────── */

test("the stamp records when it was logged and what was running", () => {
  assert.equal(
    buildQuickNoteStamp(AT, origin({ kind: "timer", label: "Writing docs", elapsedSec: 4320 }), elapsed),
    "Logged 23 Aug 2026 · 14:32 · while tracking “Writing docs” (72m)",
  );
});

test("a timer with unknown elapsed time drops the duration, not the title", () => {
  assert.equal(
    buildQuickNoteStamp(AT, origin({ kind: "timer", label: "Writing docs" }), elapsed),
    "Logged 23 Aug 2026 · 14:32 · while tracking “Writing docs”",
  );
});

test("breaks and idle notes are stamped honestly too", () => {
  assert.equal(
    buildQuickNoteStamp(AT, origin({ kind: "break", label: "Short break" }), elapsed),
    "Logged 23 Aug 2026 · 14:32 · during your short break",
  );
  assert.equal(
    buildQuickNoteStamp(AT, origin(), elapsed),
    "Logged 23 Aug 2026 · 14:32 · no timer running",
  );
});

/* ─── Document ────────────────────────────────────────────────────────────── */

test("the stamp is its own paragraph so deleting it does not take the note", () => {
  const doc = buildQuickNoteDoc("Shipped the badge fix", "Logged 23 Aug 2026 · 14:32") as {
    type: string;
    content: { type: string; content: { text: string; marks?: { type: string }[] }[] }[];
  };

  assert.equal(doc.type, "doc");
  assert.equal(doc.content.length, 2);
  assert.equal(doc.content[0].content[0].text, "Logged 23 Aug 2026 · 14:32");
  assert.deepEqual(doc.content[0].content[0].marks, [{ type: "italic" }]);
  assert.equal(doc.content[1].content[0].text, "Shipped the badge fix");
  assert.equal(doc.content[1].content[0].marks, undefined);
});

test("an empty body yields an empty paragraph, not a text node with no text", () => {
  // TipTap rejects `{ type: "text", text: "" }`, which would make the note
  // unopenable rather than merely empty.
  const doc = buildQuickNoteDoc("   ", "stamp") as { content: { content: unknown[] }[] };
  assert.deepEqual(doc.content[1].content, []);
});

/* ─── Tag ─────────────────────────────────────────────────────────────────── */

test("the notes tag is separate from the reporting tag", () => {
  // `QUICK_NOTE_TAG` ("quick-note") is excluded from work totals by the report
  // filters; coupling the two would let a tag rename move hours in a chart.
  assert.equal(QUICK_NOTE_NOTE_TAG, "Quicknote");
});
