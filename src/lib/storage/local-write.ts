import { type Table } from "dexie";
import { kokuDb } from "./db";

/** A durable outbox is part of the local commit, never an afterthought. */
export function localTransaction<T>(tables: Table[], operation: () => Promise<T>): Promise<T> {
  return kokuDb.transaction("rw", [...tables, kokuDb.pendingUpserts, kokuDb.pendingDeletes], async (tx) => {
    if (!tx.parent) tx.on("complete", () => {
      if (typeof window === "undefined") return;
      void import("@/lib/sync/sync-engine").then(({ flushPendingChanges }) => flushPendingChanges()).catch(() => undefined);
    });
    return operation();
  });
}

export async function queueLocalPut(table: string, row: Record<string, unknown>) {
  const rowId = String(row.id ?? row.key);
  const id = `${table}:${rowId}`;
  await kokuDb.pendingDeletes.delete(id);
  await kokuDb.pendingUpserts.put({ id, table, rowId, row, revision: crypto.randomUUID(), updatedAt: new Date().toISOString() });
}

export async function queueLocalDelete(table: string, rowId: string) {
  const id = `${table}:${rowId}`;
  await kokuDb.pendingUpserts.delete(id);
  await kokuDb.pendingDeletes.put({ id, table, rowId, revision: crypto.randomUUID(), createdAt: new Date().toISOString() });
}

export async function putLocal<T extends object>(table: Table<T, string>, row: T, add = false) {
  return localTransaction([table], async () => {
    const key = add ? await table.add(row) : await table.put(row);
    await queueLocalPut(table.name, row as Record<string, unknown>);
    return key;
  });
}

export async function deleteLocal(table: Table, id: string) {
  return localTransaction([table], async () => {
    await table.delete(id);
    await queueLocalDelete(table.name, id);
  });
}

export async function updateLocal<T extends object>(table: Table<T, string>, id: string, patch: Partial<T>) {
  return localTransaction([table], async () => {
    const existing = await table.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    await table.put(next);
    await queueLocalPut(table.name, next as Record<string, unknown>);
    return next;
  });
}
