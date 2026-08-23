"use client";

import { kokuDb } from "@/lib/storage/db";

const SYNCABLE_TABLES = ["timeEntries", "projects", "categories", "notes", "noteLinks"] as const;
type SyncTable = (typeof SYNCABLE_TABLES)[number];

const LAST_SYNC_KEY = "lastSyncAt";

async function getLastSyncAt(): Promise<string | null> {
  const row = await kokuDb.settings.get(LAST_SYNC_KEY);
  return typeof row?.value === "string" ? row.value : null;
}

async function setLastSyncAt(iso: string) {
  await kokuDb.settings.put({ key: LAST_SYNC_KEY, value: iso });
}

async function pullTable(table: SyncTable, since: string | null): Promise<number> {
  const url = since ? `/api/sync/${table}?since=${encodeURIComponent(since)}` : `/api/sync/${table}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pull ${table} failed: ${res.status}`);

  const { rows } = (await res.json()) as { rows: unknown[] };
  if (!rows.length) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (kokuDb as any)[table].bulkPut(rows);
  return rows.length;
}

async function pushTable(table: SyncTable): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (kokuDb as any)[table].toArray();
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
}

export async function syncNow(): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { pulled: 0, pushed: 0, error: "Offline" };
  }

  // Check auth first
  const meRes = await fetch("/api/auth/me");
  const { user } = (await meRes.json()) as { user: { id: string } | null };
  if (!user) {
    return { pulled: 0, pushed: 0, error: "Not signed in" };
  }

  const since = await getLastSyncAt();
  let pulled = 0;
  let pushed = 0;

  // Push first (local wins), then pull remote changes
  for (const table of SYNCABLE_TABLES) {
    pushed += await pushTable(table);
  }
  for (const table of SYNCABLE_TABLES) {
    pulled += await pullTable(table, since);
  }

  await setLastSyncAt(new Date().toISOString());
  return { pulled, pushed };
}

// Push a single row change immediately (call after any IndexedDB write in cloud mode)
export async function syncRow(table: SyncTable, row: unknown): Promise<void> {
  if (!navigator.onLine) return;

  const meRes = await fetch("/api/auth/me");
  const { user } = (await meRes.json()) as { user: { id: string } | null };
  if (!user) return;

  await fetch(`/api/sync/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: [row] }),
  });
}

// Delete a row from cloud
export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  if (!navigator.onLine) return;

  const meRes = await fetch("/api/auth/me");
  const { user } = (await meRes.json()) as { user: { id: string } | null };
  if (!user) return;

  await fetch(`/api/sync/${table}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
