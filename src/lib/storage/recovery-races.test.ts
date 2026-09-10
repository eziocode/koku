import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { KokuDB, kokuDb } from "./db";
import { restoreBackup } from "./backup";
import { invalidateAuthCache, syncNow } from "@/lib/sync/sync-engine";

const date = "2026-09-01T10:00:00.000Z";
const note = { id: "note", title: "Original", slug: "original", content: {}, tags: [], createdAt: date, updatedAt: date };
const backup = { version: 3, exportedAt: date, data: { notes: [{ ...note, title: "Restored" }] } };
beforeEach(async () => {
  await kokuDb.transaction("rw", kokuDb.tables, async () => { for (const table of kokuDb.tables) await table.clear(); });
  await kokuDb.notes.put(note);
});

test("restore serializes against a second connection without losing its edit", async () => {
  const otherTab = new KokuDB();
  try {
    await otherTab.open();
    await Promise.all([
      restoreBackup(backup),
      otherTab.notes.put({ ...note, title: "Other tab edit" }),
    ]);
    const current = await kokuDb.notes.get(note.id);
    const snapshots = await kokuDb.recoverySnapshots.toArray();
    assert.ok(current?.title === "Other tab edit" || snapshots.some((snapshot) => snapshot.data.notes.some((row) => (row as typeof note).title === "Other tab edit")));
    assert.equal((await kokuDb.noteMetadata.get(note.id))?.title, current?.title);
  } finally { otherTab.close(); }
});

test("restore during cloud fetch prevents stale cloud replacement", async () => {
  const originalFetch = globalThis.fetch;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  let started!: () => void;
  let release!: () => void;
  const fetching = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/me")) return Response.json({ user: { id: "synthetic" } });
    if (url.includes("/sync/projects")) { started(); await gate; }
    return Response.json({ rows: [] });
  };
  invalidateAuthCache();
  try {
    const syncing = syncNow("cloud");
    await fetching;
    await restoreBackup(backup);
    release();
    await assert.rejects(syncing, /restored during sync/);
    assert.equal((await kokuDb.notes.get(note.id))?.title, "Restored");
    assert.equal((await kokuDb.storageMeta.get("syncPaused"))?.value, true);
  } finally {
    release();
    globalThis.fetch = originalFetch;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    invalidateAuthCache();
  }
});
