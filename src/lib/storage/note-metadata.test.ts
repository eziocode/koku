import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Dexie, { liveQuery } from "dexie";
import { KokuDB, kokuDb, type Note } from "./db";
import { noteActions } from "./note-actions";
import { rebuildNoteMetadata, toNoteMetadata } from "./note-metadata";
import { createBackup, restoreBackup } from "./backup";

const date = "2026-09-01T10:00:00.000Z";
const note: Note = { id: "one", title: "One", slug: "one", tags: ["tag"], content: { type: "doc" }, createdAt: date, updatedAt: date };
beforeEach(async () => {
  await kokuDb.transaction("rw", kokuDb.tables, async () => {
    for (const table of kokuDb.tables) await table.clear();
  });
});

test("projection follows add, partial update, bulk put and delete", async () => {
  await kokuDb.notes.add(note);
  assert.deepEqual(await kokuDb.noteMetadata.get(note.id), toNoteMetadata(note));
  await kokuDb.notes.update(note.id, { title: "Changed" });
  assert.equal((await kokuDb.noteMetadata.get(note.id))?.title, "Changed");
  await kokuDb.notes.bulkPut([{ ...note, title: "Imported" }, { ...note, id: "two" }]);
  assert.equal((await kokuDb.noteMetadata.get(note.id))?.title, "Imported");
  await kokuDb.notes.delete(note.id);
  assert.equal(await kokuDb.noteMetadata.count(), 1);
  await kokuDb.notes.clear();
  assert.equal(await kokuDb.noteMetadata.count(), 0);
});

test("same ID in personal notes stays isolated", async () => {
  await kokuDb.notes.put(note);
  await kokuDb.personalNotes.put({ ...note, title: "Secret" });
  await kokuDb.notes.clear();
  assert.equal(await kokuDb.noteMetadata.count(), 0);
  assert.equal((await kokuDb.personalNoteMetadata.get(note.id))?.title, "Secret");
});

test("failed outer commit rolls back notes, projection and outbox", async () => {
  await assert.rejects(kokuDb.transaction("rw", kokuDb.tables, async () => {
    await noteActions("shared").createNote({ title: "Abort", content: {}, tags: [] });
    throw new Error("simulated quota failure");
  }), /quota/);
  assert.equal(await kokuDb.notes.count(), 0);
  assert.equal(await kokuDb.noteMetadata.count(), 0);
  assert.equal(await kokuDb.pendingUpserts.count(), 0);
});

test("restore rebuilds metadata without exporting it", async () => {
  await kokuDb.notes.put(note);
  const exported = await createBackup();
  assert.equal("noteMetadata" in exported.data, false);
  await restoreBackup({ ...exported, data: { notes: [{ ...note, id: "restored" }] } });
  assert.deepEqual(await kokuDb.noteMetadata.toArray(), [toNoteMetadata({ ...note, id: "restored" })]);
});

test("metadata live queries receive document writes", async () => {
  const counts: number[] = [];
  let resolveNext: (() => void) | undefined;
  const next = () => new Promise<void>((resolve) => { resolveNext = resolve; });
  const initial = next();
  const subscription = liveQuery(() => kokuDb.noteMetadata.count()).subscribe((count) => { counts.push(count); resolveNext?.(); });
  try {
    await initial;
    const changed = next();
    await kokuDb.notes.put(note);
    await changed;
    assert.deepEqual(counts, [0, 1]);
  } finally { subscription.unsubscribe(); }
});

test("v11 migration backfills both scopes and preserves original documents", async () => {
  const name = "metadata-migration-test";
  const old = new Dexie(name);
  old.version(11).stores({ notes: "id, slug, updatedAt, createdAt", personalNotes: "id, slug, updatedAt, createdAt" });
  await old.table("notes").put(note);
  await old.table("personalNotes").put({ ...note, title: "Private" });
  old.close();
  const upgraded = new KokuDB(name);
  try {
    await upgraded.open();
    assert.deepEqual(await upgraded.noteMetadata.get(note.id), toNoteMetadata(note));
    assert.equal((await upgraded.personalNoteMetadata.get(note.id))?.title, "Private");
    assert.deepEqual(await upgraded.notes.get(note.id), note);
  } finally { await upgraded.delete(); }
});

test("metadata quota failure aborts document write", async () => {
  const fail = () => { throw new DOMException("Metadata full", "QuotaExceededError"); };
  kokuDb.noteMetadata.hook("creating", fail);
  try { await assert.rejects(kokuDb.notes.put(note), /Metadata full/); }
  finally { kokuDb.noteMetadata.hook("creating").unsubscribe(fail); }
  assert.equal(await kokuDb.notes.count(), 0);
  assert.equal(await kokuDb.noteMetadata.count(), 0);
});

test("derived metadata can be rebuilt without changing portable data", async () => {
  await kokuDb.notes.put(note);
  await kokuDb.noteMetadata.clear();
  const before = await createBackup();
  await rebuildNoteMetadata(kokuDb);
  assert.deepEqual(await kokuDb.noteMetadata.get(note.id), toNoteMetadata(note));
  assert.deepEqual((await createBackup()).data, before.data);
});
