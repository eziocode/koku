"use client";

import { kokuDb } from "@/lib/storage/db";

export const SYNCABLE_TABLES = ["timeEntries", "projects", "categories", "notes", "noteLinks", "settings"] as const;
export type SyncTable = (typeof SYNCABLE_TABLES)[number];

const LAST_SYNC_KEY = "lastSyncAt";

// Cache auth check to avoid a Catalyst API call on every mutation.
// The Catalyst SDK logs NO_ACCESS to stderr before throwing, so repeated
// unauthenticated calls produce continuous server-side noise.
const AUTH_CACHE_TTL_MS = 30_000;
let authCache: { user: { id: string } | null; expiresAt: number } | null = null;

async function getAuthUser(): Promise<{ id: string } | null> {
  const now = Date.now();
  if (authCache && authCache.expiresAt > now) return authCache.user;
  const res = await fetch("/api/auth/me");
  const { user } = (await res.json()) as { user: { id: string } | null };
  authCache = { user, expiresAt: now + AUTH_CACHE_TTL_MS };
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

async function pullTable(table: SyncTable, since: string | null, replace = false): Promise<number> {
  const url = since ? `/api/sync/${table}?since=${encodeURIComponent(since)}` : `/api/sync/${table}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pull ${table} failed: ${res.status}`);

  const payload = (await res.json()) as { rows?: unknown[] };
  const rows = (payload.rows ?? []).filter((row) => !isInternalSetting(table, row));
  if (replace) {
    // Cloud choice replaces synced tables only. AI keys remain local.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (kokuDb as any)[table].clear();
  }
  if (!rows.length) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (kokuDb as any)[table].bulkPut(rows);
  return rows.length;
}

async function pushTable(table: SyncTable): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (kokuDb as any)[table].toArray() as unknown[]).filter((row) => !isInternalSetting(table, row));
  if (!rows.length) return 0;

  const res = await fetch(`/api/sync/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(`Push ${table} failed: ${res.status}`);

  const { synced } = (await res.json()) as { synced: number };
  return synced;
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

  const since = await getLastSyncAt(user.id);
  if (!choice) {
    const conflict = await compareSyncData();
    if (conflict) return { pulled: 0, pushed: 0, conflict };
  }
  if (choice === "cancel") return { pulled: 0, pushed: 0, conflict: undefined };
  let pulled = 0;
  let pushed = 0;

  if (choice !== "cloud") {
    for (const table of SYNCABLE_TABLES) pushed += await pushTable(table);
  }
  for (const table of SYNCABLE_TABLES) {
    pulled += await pullTable(table, choice === "cloud" ? null : since, choice === "cloud");
  }

  await setLastSyncAt(user.id, new Date().toISOString());
  return { pulled, pushed };
}

/** Prompt once at workspace level after auth or manual sync detects divergence. */
export async function syncWithConflictPrompt(): Promise<SyncResult> {
  const first = await syncNow();
  if (!first.conflict) return first;
  const c = first.conflict;
  const answer = window.prompt(`Cloud/local data differ (${c.total} rows: ${c.addedLocal} local-only, ${c.addedCloud} cloud-only, ${c.changed} changed). Type local, cloud, or cancel.`, "cancel")?.trim().toLowerCase();
  const choice: SyncChoice = answer === "local" ? "local" : answer === "cloud" ? "cloud" : "cancel";
  if (choice === "cancel") return { pulled: 0, pushed: 0, error: "Sync cancelled", conflict: c };
  return syncNow(choice);
}

// Push a single row change immediately (call after any IndexedDB write in cloud mode)
export async function syncRow(table: SyncTable, row: unknown): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const user = await getAuthUser();
    if (!user) return;

    const res = await fetch(`/api/sync/${table}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [row] }),
    });
    if (!res.ok) throw new Error(`Push ${table} failed: ${res.status}`);
  } catch {
    // Local write remains source of truth while offline or during transient auth/network failure.
  }
}

// Delete a row from cloud
export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const user = await getAuthUser();
    if (!user) return;
    await fetch(`/api/sync/${table}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // Full sync repairs pending deletes when user manually syncs.
  }
}
