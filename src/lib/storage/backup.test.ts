import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { kokuDb } from "./db";
import { createBackup, parseBackup, restoreBackup } from "./backup";

const date = "2026-09-01T10:00:00.000Z";
const note = { id: "existing", title: "Keep me", slug: "keep", tags: [], content: { type: "doc" }, createdAt: date, updatedAt: date };
const backup = (data: object, timerState?: unknown) => ({ version: 3, exportedAt: date, data, timerState });
beforeEach(async () => {
  await kokuDb.transaction("rw", kokuDb.tables, async () => {
    for (const table of kokuDb.tables) await table.clear();
    await kokuDb.notes.put(note);
  });
});

test("malformed timer recovery rejects before replacing workspace", async () => {
  for (const timerState of [42, { timers: "bad" }, { timers: [{ title: "broken", startTime: "yesterday" }] }, { timers: [], activeBreak: { id: "bad" } }]) {
    await assert.rejects(restoreBackup(backup({ notes: [] }, timerState)));
    assert.deepEqual(await kokuDb.notes.get(note.id), note);
    assert.equal(await kokuDb.recoverySnapshots.count(), 0);
  }
});

test("older backup leaves absent collections and local settings intact", async () => {
  await kokuDb.personalNotes.put({ ...note, id: "private" });
  await kokuDb.settings.put({ key: "auth.token", value: "local" });
  await restoreBackup({ version: 1, exportedAt: date, data: { notes: [] } });
  assert.equal(await kokuDb.notes.count(), 0);
  assert.equal(await kokuDb.personalNotes.count(), 1);
  assert.equal((await kokuDb.settings.get("auth.token"))?.value, "local");
  assert.equal((await kokuDb.storageMeta.get("syncPaused"))?.value, true);
});

test("snapshot quota failure aborts replacement and preserves outbox and drafts", async () => {
  await kokuDb.pendingUpserts.put({ id: "notes:existing", table: "notes", rowId: note.id, row: note, revision: "1", updatedAt: date });
  await kokuDb.noteDrafts.put({ id: "draft", noteId: note.id, scope: "shared", payload: note, baseUpdatedAt: date, updatedAt: date });
  const put = kokuDb.recoverySnapshots.put;
  kokuDb.recoverySnapshots.put = () => { throw new DOMException("Full", "QuotaExceededError"); };
  try {
    await assert.rejects(restoreBackup(backup({ notes: [] })), /Full/);
  } finally { kokuDb.recoverySnapshots.put = put; }
  assert.deepEqual(await kokuDb.notes.get(note.id), note);
  assert.equal(await kokuDb.pendingUpserts.count(), 1);
  assert.equal(await kokuDb.noteDrafts.count(), 1);
});

test("v3 recovery round trip retains drafts, completions, personal notes", async () => {
  await kokuDb.personalNotes.put({ ...note, id: "private" });
  await kokuDb.timerCompletions.put({ id: "timer", entryId: "entry", completedAt: date });
  await kokuDb.noteDrafts.put({ id: "draft", noteId: note.id, scope: "shared", payload: note, baseUpdatedAt: date, updatedAt: date });
  const exported = await createBackup();
  await restoreBackup(backup({ notes: [] }));
  const snapshot = await kokuDb.recoverySnapshots.toCollection().first();
  assert.equal(snapshot?.data.notes.length, 1);
  await restoreBackup(exported);
  assert.equal(await kokuDb.notes.count(), 1);
  assert.equal(await kokuDb.personalNotes.count(), 1);
  assert.equal(await kokuDb.noteDrafts.count(), 1);
  assert.equal(await kokuDb.timerCompletions.count(), 1);
});

test("duplicate records and malformed documents fail before mutation", () => {
  assert.throws(() => parseBackup(backup({ notes: [note, note] })), /Duplicate/);
  assert.throws(() => parseBackup(backup({ notes: [{ ...note, tags: null }] })));
});
