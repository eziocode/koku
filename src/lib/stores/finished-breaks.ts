/**
 * Remembers break ids this client has already finalised (written an entry for
 * and torn down locally), independent of the timer store's own state.
 *
 * Why this needs to exist at all: `finishBreak` in `timer-store.ts` removes
 * the break from state entirely (`activeBreak: null`) rather than leaving a
 * `completedAt`-stamped record behind, and the cloud `live_breaks_koku` table
 * has no `completedAt` column either — a break is only ever *present* or
 * *tombstoned* there. If a stale cloud pull races the tombstone (see
 * `live-state-sync.ts`'s 409 handling) and hands back the break as still
 * live, nothing about the record itself says "this one's already done" — so
 * this module is the guard that says so instead.
 *
 * Backed by `localStorage`, not the zustand persisted store, so it survives
 * independently of `activeBreak`'s own lifecycle and needs no schema
 * migration of its own. Small and self-pruning: entries older than
 * `RETENTION_MS` are dropped on every read.
 */

const STORAGE_KEY = "koku:finished-breaks";
const RETENTION_MS = 48 * 60 * 60 * 1000;

interface FinishedBreakEntry {
  id: string;
  at: number;
}

function readAll(): FinishedBreakEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - RETENTION_MS;
    return parsed.filter(
      (entry): entry is FinishedBreakEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as FinishedBreakEntry).id === "string" &&
        typeof (entry as FinishedBreakEntry).at === "number" &&
        (entry as FinishedBreakEntry).at >= cutoff,
    );
  } catch {
    return [];
  }
}

function writeAll(entries: FinishedBreakEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — the guard degrades to "no memory", not a crash.
  }
}

/** Marks `breakId` as finalised so a later stale cloud pull can't resurrect it. */
export function markBreakFinished(breakId: string): void {
  const entries = readAll().filter((entry) => entry.id !== breakId);
  entries.push({ id: breakId, at: Date.now() });
  writeAll(entries);
}

/** Whether this client has already finalised `breakId`. */
export function isBreakFinished(breakId: string): boolean {
  return readAll().some((entry) => entry.id === breakId);
}
