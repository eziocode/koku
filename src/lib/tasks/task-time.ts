import { kokuDb } from "@/lib/storage/db";
import { getDurationSec } from "@/lib/time-tracking/time-entries";

/**
 * Accumulated time for one task, summed over however many separate — possibly
 * non-contiguous, spanning days or weeks — entries are linked to it. A plain
 * sum over the `taskId` index: IndexedDB excludes `null`/`undefined` from an
 * index, so an unlinked entry can never leak into this total.
 */
export async function getTaskSeconds(taskId: string, now: number = Date.now()): Promise<number> {
  const entries = await kokuDb.timeEntries.where("taskId").equals(taskId).toArray();
  return entries.reduce((total, entry) => {
    if (entry.durationSec !== null && entry.durationSec !== undefined) {
      return total + entry.durationSec;
    }
    if (entry.endAt) {
      return total + (getDurationSec(entry.startAt, entry.endAt) ?? 0);
    }
    // Still running: extrapolate from `now` rather than skip it, so a task
    // card's total ticks up live along with an active timer linked to it.
    return total + Math.max(0, Math.floor((now - Date.parse(entry.startAt)) / 1000));
  }, 0);
}
