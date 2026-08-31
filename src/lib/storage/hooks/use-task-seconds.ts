"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb, type Task } from "@/lib/storage/db";
import { getTaskAccruedSec, getTaskSeconds } from "@/lib/tasks/task-time";
import { useSecondTick } from "@/lib/stores/use-ticker";

/**
 * Reactive accumulated time for one task. Recomputes whenever a linked entry
 * is added, edited, or removed — not every second, so a card total won't
 * visibly tick while a linked timer runs, but it's exact the moment that
 * timer is stopped and its entry written.
 */
export function useTaskSeconds(taskId: string): number {
  return useLiveQuery(() => getTaskSeconds(taskId), [taskId], 0) ?? 0;
}

/**
 * Reactive accrued time for a task's own in-progress stopwatch (banked plus
 * the current running stretch). Ticks live off the shared second clock while
 * `inProgressSince` is set, and freezes as soon as the task leaves
 * "in_progress" since `getTaskAccruedSec` then reads the bank alone.
 */
export function useTaskAccruedSec(task: Task): number {
  // `getTaskAccruedSec` only reads `now` when `inProgressSince` is set, so
  // it's safe to always pass the shared clock rather than reach for
  // `Date.now()` directly during render.
  const now = useSecondTick();
  return getTaskAccruedSec(task, now);
}

/** Linked entries for a task's detail view, most recent first. */
export function useTaskEntries(taskId: string) {
  return useLiveQuery(
    async () => {
      const entries = await kokuDb.timeEntries.where("taskId").equals(taskId).toArray();
      return entries.sort((a, b) => b.startAt.localeCompare(a.startAt));
    },
    [taskId],
    [],
  );
}
