/**
 * Dexie reads backing the "own profile" shortcut.
 *
 * When an admin opens their own detail page the data is already on the device,
 * so these replace the API round-trip. `Manual Sync` forces the API path
 * instead, which is how a stale local mirror gets corrected.
 */

import type { AdminRow } from "@/lib/admin-data";
import { kokuDb } from "@/lib/storage/db";

export async function localEntriesForDay(date: string): Promise<AdminRow[]> {
  const from = new Date(`${date}T00:00:00`).toISOString();
  const to = new Date(`${date}T23:59:59.999`).toISOString();
  const entries = await kokuDb.timeEntries
    .where("startAt")
    .between(from, to, true, true)
    .toArray();
  return entries
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .map((e) => ({ ...e, table: "timeEntries" } as AdminRow));
}

export async function localNotesForDay(date: string): Promise<AdminRow[]> {
  const from = new Date(`${date}T00:00:00`).toISOString();
  const to = new Date(`${date}T23:59:59.999`).toISOString();
  const all = await kokuDb.notes.orderBy("updatedAt").reverse().toArray();
  return all
    .filter((n) => n.updatedAt >= from && n.updatedAt <= to)
    .map((n) => ({ ...n, table: "notes" } as AdminRow));
}

export async function localReportRows(start: string, end: string): Promise<AdminRow[]> {
  const [entries, notes] = await Promise.all([
    kokuDb.timeEntries.toArray(),
    kokuDb.notes.toArray(),
  ]);
  const from = `${start}T00:00:00`;
  const until = `${end}T23:59:59.999`;
  return [
    ...entries.filter((row) => row.startAt >= from && row.startAt <= until).map((row) => ({ ...row, table: "timeEntries" } as AdminRow)),
    ...notes.filter((row) => row.updatedAt >= from && row.updatedAt <= until).map((row) => ({ ...row, table: "notes" } as AdminRow)),
  ].sort((a, b) => String(b.startAt ?? b.updatedAt).localeCompare(String(a.startAt ?? a.updatedAt)));
}

export async function localFirstActivity(): Promise<string | null> {
  const oldest = await kokuDb.timeEntries.orderBy("startAt").first();
  return oldest?.startAt ? oldest.startAt.slice(0, 10) : null;
}

/** Tasks aren't day-scoped like entries/notes, so this filters by the From/To range instead of a single day. */
export async function localTasksForRange(start: string, end: string): Promise<AdminRow[]> {
  const from = `${start}T00:00:00`;
  const until = `${end}T23:59:59.999`;
  const all = await kokuDb.tasks.orderBy("updatedAt").reverse().toArray();
  return all
    .filter((task) => task.createdAt >= from && task.createdAt <= until)
    .map((task) => ({ ...task, table: "tasks" } as AdminRow));
}
