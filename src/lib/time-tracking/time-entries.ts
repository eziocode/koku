import { kokuDb, type TimeEntry } from "@/lib/storage/db";
import { syncRow } from "@/lib/sync/sync-engine";

/**
 * Framework-free time-entry writes.
 *
 * Extracted from `useTimeEntries` so callers that are not React components — the
 * break runner, the mini player's stop button, notification-driven quick notes —
 * can persist an entry without mounting a hook. Verified safe to lift: the
 * original closure did not reference the hook's `filters`.
 */

export interface CreateTimeEntryInput {
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
  tags: string[];
  notes?: string | null;
}

export function getDurationSec(startAt: string, endAt?: string | null): number | null {
  if (!endAt) {
    return null;
  }

  return Math.max(0, Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 1000));
}

export async function createTimeEntry(data: CreateTimeEntryInput): Promise<TimeEntry> {
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    title: data.title,
    projectId: data.projectId ?? null,
    categoryId: data.categoryId ?? null,
    startAt: data.startAt,
    endAt: data.endAt ?? null,
    durationSec: data.durationSec ?? getDurationSec(data.startAt, data.endAt),
    tags: data.tags,
    notes: data.notes ?? null,
    createdAt: new Date().toISOString(),
  };

  await kokuDb.timeEntries.add(entry);
  void syncRow("timeEntries", entry);
  return entry;
}
