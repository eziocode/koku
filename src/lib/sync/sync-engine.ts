"use client";

import {
  kokuDb,
  type PendingDelete,
  type PendingUpsert,
} from "@/lib/storage/db";
import { toast } from "@/components/ui/toast";
import { captureRecovery } from "@/lib/storage/backup";
import { LOCAL_ONLY_FIELDS } from "@/lib/sync/table-config";

// "tasks" comes before "timeEntries" so a pushed entry's taskId never points
// at a task the cloud mirror doesn't have yet.
export const SYNCABLE_TABLES = ["tasks", "timeEntries", "projects", "categories", "notes", "personalNotes", "noteLinks", "settings", "reminders"] as const;
export type SyncTable = (typeof SYNCABLE_TABLES)[number];

const LAST_SYNC_KEY = "lastSyncAt";
const PENDING_SYNC_TOAST_ID = "pending-cloud-sync";

// Cache auth check to avoid a Catalyst API call on every mutation.
// The Catalyst SDK logs NO_ACCESS to stderr before throwing, so repeated
// unauthenticated calls produce continuous server-side noise.
const AUTH_CACHE_TTL_MS = 30_000;
const NO_AUTH_CACHE_TTL_MS = 2_000;
let authCache: { user: { id: string } | null; expiresAt: number } | null = null;
let conflictDecisionPending = false;
const mutationLocks = new Map<string, Promise<void>>();
let pendingSyncWarningShown = false;

export async function getAuthUser(): Promise<{ id: string } | null> {
  const now = Date.now();
  if (authCache && authCache.expiresAt > now) return authCache.user;
  // An auth result must reflect current browser session. In particular, do not
  // reuse a stale anonymous response immediately after the OAuth redirect.
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
  const { user } = (await res.json()) as { user: { id: string } | null };
  // Cache a signed-in user to avoid a request per save, but only cache an
  // anonymous state briefly: session cookies can appear just after reload.
  authCache = { user, expiresAt: now + (user ? AUTH_CACHE_TTL_MS : NO_AUTH_CACHE_TTL_MS) };
  return user;
}

export function invalidateAuthCache() {
  authCache = null;
}

async function getLastSyncAt(userId: string): Promise<string | null> {
  const row = await kokuDb.settings.get(`${LAST_SYNC_KEY}:${userId}`);
  return typeof row?.value === "string" ? row.value : null;
}

async function setLastSyncAt(userId: string, iso: string) {
  await kokuDb.settings.put({ key: `${LAST_SYNC_KEY}:${userId}`, value: iso });
}

interface PushResponse {
  synced?: number;
  syncedIds?: string[];
  errors?: { rowId: string | null; error: string }[];
  error?: string;
}

function pendingId(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

function withMutationLock<T>(
  table: SyncTable,
  id: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = pendingId(table, id);
  const previous = mutationLocks.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const marker = result.then(() => undefined, () => undefined);
  mutationLocks.set(key, marker);
  return result.finally(() => {
    if (mutationLocks.get(key) === marker) mutationLocks.delete(key);
  });
}

function withMutationLocks<T>(
  table: SyncTable,
  ids: string[],
  operation: () => Promise<T>,
): Promise<T> {
  let next = operation;
  for (const id of [...new Set(ids)].sort().reverse()) {
    const following = next;
    next = () => withMutationLock(table, id, following);
  }
  return next();
}

async function waitForMutationLocks(): Promise<void> {
  while (mutationLocks.size > 0) {
    await Promise.all([...mutationLocks.values()]);
  }
}

function notifyPendingSync() {
  if (pendingSyncWarningShown) return;
  pendingSyncWarningShown = true;
  toast.warning("Saved locally. Cloud sync is pending; use manual sync to retry.", {
    id: PENDING_SYNC_TOAST_ID,
  });
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as PushResponse;
    return payload.errors?.[0]?.error ?? payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function pushRows(table: SyncTable, rows: unknown[]): Promise<PushResponse> {
  if (!rows.length) return { synced: 0, syncedIds: [], errors: [] };
  const response = await fetch(`/api/sync/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  const payload = (await response.json()) as PushResponse;
  if (!response.ok && response.status !== 207) {
    throw new Error(payload.errors?.[0]?.error ?? payload.error ?? `Push ${table} failed: ${response.status}`);
  }
  return payload;
}

async function deliverPendingUpserts(): Promise<number> {
  const pending = await kokuDb.pendingUpserts.toArray();
  let pushed = 0;
  for (const table of SYNCABLE_TABLES) {
    const items = pending.filter((item) => item.table === table);
    if (!items.length) continue;
    const result = await withMutationLocks(
      table,
      items.map((item) => item.rowId),
      () => pushRows(table, items.map((item) => item.row)),
    );
    const syncedIds = new Set(result.syncedIds ?? []);
    for (const item of items) {
      if (!syncedIds.has(item.rowId)) continue;
      const current = await kokuDb.pendingUpserts.get(item.id);
      if (current?.revision === item.revision) {
        await kokuDb.pendingUpserts.delete(item.id);
        pushed += 1;
      }
    }
    if (result.errors?.length) throw new Error(result.errors[0].error);
  }
  return pushed;
}

async function deliverPendingDeletes(): Promise<number> {
  const pending = await kokuDb.pendingDeletes.toArray();
  let deleted = 0;
  for (const item of pending) {
    if (!SYNCABLE_TABLES.includes(item.table as SyncTable)) continue;
    const table = item.table as SyncTable;
    const removed = await withMutationLock(
      table,
      item.rowId,
      async () => {
        const response = await fetch(
          `/api/sync/${table}?id=${encodeURIComponent(item.rowId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          throw new Error(await responseError(
            response,
            `Delete ${item.table} row ${item.rowId} failed: ${response.status}`,
          ));
        }
        const current = await kokuDb.pendingDeletes.get(item.id);
        if (current?.revision !== item.revision) return false;
        await kokuDb.pendingDeletes.delete(item.id);
        return true;
      },
    );
    if (removed) deleted += 1;
  }
  return deleted;
}

async function discardCapturedMutations(
  upserts: PendingUpsert[],
  deletes: PendingDelete[],
): Promise<void> {
  for (const item of upserts) {
    const current = await kokuDb.pendingUpserts.get(item.id);
    if (current?.revision === item.revision) await kokuDb.pendingUpserts.delete(item.id);
  }
  for (const item of deletes) {
    const current = await kokuDb.pendingDeletes.get(item.id);
    if (current?.revision === item.revision) await kokuDb.pendingDeletes.delete(item.id);
  }
}

export type SyncChoice = "local" | "cloud" | "cancel";
export interface SyncConflict {
  total: number;
  addedLocal: number;
  addedCloud: number;
  changed: number;
  byTable: Partial<Record<SyncTable, number>>;
}

function rowId(row: unknown): string {
  const value = row as Record<string, unknown>;
  return String(value.id ?? value.key ?? "");
}

function isInternalSetting(table: SyncTable, row: unknown): boolean {
  return table === "settings" && String((row as Record<string, unknown>).key ?? "").startsWith(`${LAST_SYNC_KEY}:`);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "userId").sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
}

/** Compare local and cloud snapshots. AI keys intentionally never included. */
export async function compareSyncData(): Promise<SyncConflict | null> {
  const byTable: Partial<Record<SyncTable, number>> = {};
  let addedLocal = 0; let addedCloud = 0; let changed = 0;
  for (const table of SYNCABLE_TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const local = (await (kokuDb as any)[table].toArray() as unknown[]).filter((row) => !isInternalSetting(table, row));
    const response = await fetch(`/api/sync/${table}`);
    if (!response.ok) throw new Error(`Compare ${table} failed: ${response.status}`);
    const remote = ((await response.json() as { rows?: unknown[] }).rows ?? []).filter((row) => !isInternalSetting(table, row));
    const localMap = new Map(local.map((row) => [rowId(row), stable(row)]));
    const remoteMap = new Map(remote.map((row) => [rowId(row), stable(row)]));
    let tableDiff = 0;
    for (const [id, value] of localMap) {
      if (!remoteMap.has(id)) { addedLocal++; tableDiff++; }
      else if (remoteMap.get(id) !== value) { changed++; tableDiff++; }
    }
    for (const id of remoteMap.keys()) if (!localMap.has(id)) { addedCloud++; tableDiff++; }
    if (tableDiff) byTable[table] = tableDiff;
  }
  const total = addedLocal + addedCloud + changed;
  return total ? { total, addedLocal, addedCloud, changed, byTable } : null;
}

/**
 * Local values of a table's `LOCAL_ONLY_FIELDS`, keyed by row id.
 *
 * Read *before* a `replace` clear, since after it there is nothing left to
 * carry over.
 */
async function snapshotLocalOnlyFields(
  table: SyncTable,
  fields: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  const snapshot = new Map<string, Record<string, unknown>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localRows = (await (kokuDb as any)[table].toArray()) as Record<string, unknown>[];
  for (const local of localRows) {
    const kept: Record<string, unknown> = {};
    for (const field of fields) {
      if (local[field] !== undefined) kept[field] = local[field];
    }
    if (Object.keys(kept).length) snapshot.set(rowId(local), kept);
  }
  return snapshot;
}

/** A pulled row with any local-only field the wire did not carry restored. */
function mergeLocalOnlyFields(
  row: unknown,
  fields: readonly string[],
  snapshot: Map<string, Record<string, unknown>>,
): unknown {
  const kept = snapshot.get(rowId(row));
  if (!kept) return row;
  const merged = { ...(row as Record<string, unknown>) };
  for (const field of fields) {
    if (merged[field] === undefined && kept[field] !== undefined) merged[field] = kept[field];
  }
  return merged;
}

async function fetchTable(table: SyncTable, since: string | null): Promise<unknown[]> {
  const url = since ? `/api/sync/${table}?since=${encodeURIComponent(since)}` : `/api/sync/${table}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await responseError(res, `Pull ${table} failed: ${res.status}`));
  const payload = await res.json() as { rows?: unknown[] };
  if (!Array.isArray(payload.rows) || payload.rows.some((row) => !row || typeof row !== "object" || !rowId(row))) throw new Error(`Invalid cloud data for ${table}. Local data unchanged.`);
  return payload.rows.filter((row) => !isInternalSetting(table, row));
}

async function applyTable(table: SyncTable, rows: unknown[], replace: boolean): Promise<number> {
  const localOnly = LOCAL_ONLY_FIELDS[table];
  const snapshot = localOnly?.length ? await snapshotLocalOnlyFields(table, localOnly) : null;
  if (replace) {
    if (table === "settings") await kokuDb.settings.filter((row) => !isInternalSetting(table, row)).delete();
    else await kokuDb.table(table).clear();
  }
  if (localOnly?.length && snapshot?.size) rows = rows.map((row) => mergeLocalOnlyFields(row, localOnly, snapshot));
  if (rows.length) await kokuDb.table(table).bulkPut(rows);
  return rows.length;
}

async function pushTable(table: SyncTable): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (kokuDb as any)[table].toArray() as unknown[]).filter((row) => !isInternalSetting(table, row));
  if (!rows.length) return 0;

  const result = await withMutationLocks(
    table,
    rows.map(rowId),
    () => pushRows(table, rows),
  );
  if (result.errors?.length) throw new Error(result.errors[0].error);
  const sentRows = new Map(rows.map((row) => [rowId(row), stable(row)]));
  for (const id of result.syncedIds ?? []) {
    const pending = await kokuDb.pendingUpserts.get(pendingId(table, id));
    if (pending && stable(pending.row) === sentRows.get(id)) {
      await kokuDb.pendingUpserts.delete(pending.id);
    }
  }
  return result.synced ?? 0;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  error?: string;
  conflict?: SyncConflict;
}

export async function syncNow(choice?: SyncChoice): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { pulled: 0, pushed: 0, error: "Offline" };
  }

  invalidateAuthCache();
  const user = await getAuthUser();
  if (!user) {
    return { pulled: 0, pushed: 0, error: "Not signed in" };
  }

  let keepConflictPause = false;
  try {
    if (!choice || choice === "local" || choice === "cloud") {
      conflictDecisionPending = true;
      if (pendingFlush) await pendingFlush;
      await waitForMutationLocks();
    }

    const since = await getLastSyncAt(user.id);
    if (!choice) {
      const conflict = await compareSyncData();
      if (conflict) {
        keepConflictPause = true;
        return { pulled: 0, pushed: 0, conflict };
      }
    }
    if (choice === "cancel") {
      return { pulled: 0, pushed: 0, conflict: undefined };
    }
    let pulled = 0;
    let pushed = 0;

    let discardedUpserts: PendingUpsert[] = [];
    let discardedDeletes: PendingDelete[] = [];
    if (choice === "cloud") {
      [discardedUpserts, discardedDeletes] = await Promise.all([
        kokuDb.pendingUpserts.toArray(),
        kokuDb.pendingDeletes.toArray(),
      ]);

    } else {
      const pendingResult = await flushPendingChanges({ ignoreConflictPause: true });
      if (pendingResult.error) throw new Error(pendingResult.error);
    }

    if (choice !== "cloud") {
      for (const table of SYNCABLE_TABLES) pushed += await pushTable(table);
    }
    const generation = (await kokuDb.storageMeta.get("restoredAt"))?.value;
    const pullStartedAt = new Date().toISOString();
    const snapshots = new Map<SyncTable, unknown[]>();
    for (const table of SYNCABLE_TABLES) snapshots.set(table, await fetchTable(table, choice === "cloud" ? null : since));
    await kokuDb.transaction("rw", kokuDb.tables, async () => {
      if ((await kokuDb.storageMeta.get("restoredAt"))?.value !== generation) throw new Error("Backup restored during sync. Retry manual sync.");
      if (choice === "cloud") {
        await captureRecovery("Before cloud replacement");
        await discardCapturedMutations(discardedUpserts, discardedDeletes);
      }
      for (const table of SYNCABLE_TABLES) pulled += await applyTable(table, snapshots.get(table)!, choice === "cloud");
      // Transaction serializes this overlay against writes in other tabs.
      for (const item of await kokuDb.pendingUpserts.toArray()) {
        if (SYNCABLE_TABLES.includes(item.table as SyncTable)) await kokuDb.table(item.table).put(item.row);
      }
      for (const item of await kokuDb.pendingDeletes.toArray()) {
        if (SYNCABLE_TABLES.includes(item.table as SyncTable)) await kokuDb.table(item.table).delete(item.rowId);
      }
      await setLastSyncAt(user.id, pullStartedAt);
      if (choice) await kokuDb.storageMeta.delete("syncPaused");
    });

    conflictDecisionPending = false;
    const trailing = await flushPendingChanges();
    if (trailing.error && trailing.error !== "Offline" && trailing.error !== "Not signed in") {
      throw new Error(trailing.error);
    }
    return { pulled, pushed };
  } finally {
    if (!keepConflictPause) conflictDecisionPending = false;
  }
}

export function cancelSyncConflict() {
  conflictDecisionPending = false;
}

/** Prompt once at workspace level after auth or manual sync detects divergence. */
export async function syncWithConflictPrompt(): Promise<SyncResult> {
  const first = await syncNow();
  if (!first.conflict) return first;
  const c = first.conflict;
  // UI owns conflict choice. Bootstrap keeps existing local data untouched.
  return { pulled: 0, pushed: 0, error: "Sync choice required", conflict: c };
}

// Push a single row change immediately (call after any IndexedDB write in cloud mode)
export async function syncRow(table: SyncTable, row: unknown): Promise<void> {
  const id = rowId(row);
  if (!id) throw new Error(`Cannot sync ${table} row without an id.`);
  return withMutationLock(table, id, async () => {
    const pending = {
      id: pendingId(table, id),
      table,
      rowId: id,
      row,
      revision: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    await kokuDb.transaction("rw", kokuDb.pendingUpserts, kokuDb.pendingDeletes, async () => {
      await kokuDb.pendingDeletes.where("[table+rowId]").equals([table, id]).delete();
      await kokuDb.pendingUpserts.put(pending);
    });
    if (!navigator.onLine) {
      notifyPendingSync();
      return;
    }
    if (conflictDecisionPending || (await kokuDb.storageMeta.get("syncPaused"))?.value) return;
    try {
      const user = await getAuthUser();
      if (!user) {
        // Cloud sync is optional. A missing/not-yet-restored session is not a
        // failed sync and must not show a warning on every save or reload.
        return;
      }
      const result = await pushRows(table, [row]);
      if (result.syncedIds?.includes(id)) {
        const current = await kokuDb.pendingUpserts.get(pending.id);
        if (current?.revision === pending.revision) {
          await kokuDb.pendingUpserts.delete(pending.id);
        }
      }
      if (result.errors?.length) throw new Error(result.errors[0].error);
    } catch {
      notifyPendingSync();
    }
  });
}

// Delete a row from cloud
export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  return withMutationLock(table, id, async () => {
    const pending = {
      id: pendingId(table, id),
      table,
      rowId: id,
      revision: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await kokuDb.transaction("rw", kokuDb.pendingUpserts, kokuDb.pendingDeletes, async () => {
      await kokuDb.pendingUpserts.delete(pending.id);
      await kokuDb.pendingDeletes.put(pending);
    });
    if (!navigator.onLine) {
      notifyPendingSync();
      return;
    }
    if (conflictDecisionPending || (await kokuDb.storageMeta.get("syncPaused"))?.value) return;
    try {
      const user = await getAuthUser();
      if (!user) {
        // See syncRow: wait for a signed-in session without alarming user.
        return;
      }
      const res = await fetch(
        `/api/sync/${table}?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await responseError(res, `Delete ${table} failed: ${res.status}`));
      const current = await kokuDb.pendingDeletes.get(pending.id);
      if (current?.revision === pending.revision) {
        await kokuDb.pendingDeletes.delete(pending.id);
      }
    } catch {
      notifyPendingSync();
    }
  });
}

export interface PendingSyncResult {
  pushed: number;
  deleted: number;
  pending: number;
  error?: string;
}

let pendingFlush: Promise<PendingSyncResult> | null = null;

/** Flush queued local mutations only. Empty queues make no auth or cloud requests. */
export function flushPendingChanges(
  options: { notifyOnFailure?: boolean; ignoreConflictPause?: boolean } = {},
): Promise<PendingSyncResult> {
  if (pendingFlush) return pendingFlush;
  pendingFlush = (async () => {
    const [upserts, deletes] = await Promise.all([
      kokuDb.pendingUpserts.count(),
      kokuDb.pendingDeletes.count(),
    ]);
    const pending = upserts + deletes;
    if (pending === 0) {
      pendingSyncWarningShown = false;
      return { pushed: 0, deleted: 0, pending: 0 };
    }
    if ((conflictDecisionPending || (await kokuDb.storageMeta.get("syncPaused"))?.value) && !options.ignoreConflictPause) {
      return { pushed: 0, deleted: 0, pending, error: "Sync choice required" };
    }
    if (!navigator.onLine) return { pushed: 0, deleted: 0, pending, error: "Offline" };

    const user = await getAuthUser();
    if (!user) return { pushed: 0, deleted: 0, pending, error: "Not signed in" };

    try {
      const pushed = await deliverPendingUpserts();
      const deleted = await deliverPendingDeletes();
      const remaining = await kokuDb.pendingUpserts.count() + await kokuDb.pendingDeletes.count();
      if (remaining === 0) pendingSyncWarningShown = false;
      return { pushed, deleted, pending: remaining };
    } catch (error) {
      if (options.notifyOnFailure) notifyPendingSync();
      return {
        pushed: 0,
        deleted: 0,
        pending,
        error: error instanceof Error ? error.message : "Cloud sync failed.",
      };
    }
  })().finally(() => {
    pendingFlush = null;
  });
  return pendingFlush;
}
