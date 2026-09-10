import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { kokuDb } from "./db";
import { noteActions } from "./note-actions";
import { commitNote, detachNoteSave, discardNoteSave, stageNote } from "./note-saves";

beforeEach(async () => {
  for (const draft of await kokuDb.noteDrafts.toArray()) await discardNoteSave(draft.id);
  await kokuDb.transaction("rw", kokuDb.tables, async () => { for (const table of kokuDb.tables) await table.clear(); });
});

test("navigation detaches listener without dropping immediate draft or commit", async () => {
  const note = await noteActions("shared").createNote({ title: "Original", content: {}, tags: [] });
  const id = stageNote(note.id, "shared", { title: "Typed immediately", content: {}, tags: [] }, note.updatedAt);
  detachNoteSave(id);
  await commitNote(id);
  assert.equal((await kokuDb.notes.get(note.id))?.title, "Typed immediately");
  assert.equal(await kokuDb.noteDrafts.count(), 0);
  assert.equal((await kokuDb.noteMetadata.get(note.id))?.title, "Typed immediately");
});

test("conflicting edit preserves newer note and recoverable draft", async () => {
  const note = await noteActions("shared").createNote({ title: "Original", content: {}, tags: [] });
  const id = stageNote(note.id, "shared", { title: "My draft", content: {}, tags: [] }, note.updatedAt);
  await kokuDb.notes.update(note.id, { title: "Other tab", updatedAt: "2099-01-01T00:00:00.000Z" });
  await assert.rejects(commitNote(id), /changed elsewhere/);
  assert.equal((await kokuDb.notes.get(note.id))?.title, "Other tab");
  assert.equal((await kokuDb.noteDrafts.get(id))?.payload.title, "My draft");
  await discardNoteSave(id);
});

test("failed outbox write keeps original note and durable draft", async () => {
  const note = await noteActions("shared").createNote({ title: "Original", content: {}, tags: [] });
  const id = stageNote(note.id, "shared", { title: "Retry me", content: {}, tags: [] }, note.updatedAt);
  const put = kokuDb.pendingUpserts.put;
  kokuDb.pendingUpserts.put = () => { throw new DOMException("Out of space", "QuotaExceededError"); };
  try { await assert.rejects(commitNote(id), /Out of space/); }
  finally { kokuDb.pendingUpserts.put = put; }
  assert.equal((await kokuDb.notes.get(note.id))?.title, "Original");
  assert.equal((await kokuDb.noteMetadata.get(note.id))?.title, "Original");
  assert.equal((await kokuDb.noteDrafts.get(id))?.payload.title, "Retry me");
  await commitNote(id);
  assert.equal((await kokuDb.notes.get(note.id))?.title, "Retry me");
});
