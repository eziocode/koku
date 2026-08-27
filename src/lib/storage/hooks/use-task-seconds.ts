"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb } from "@/lib/storage/db";
import { getTaskSeconds } from "@/lib/tasks/task-time";

/**
 * Reactive accumulated time for one task. Recomputes whenever a linked entry
 * is added, edited, or removed — not every second, so a card total won't
 * visibly tick while a linked timer runs, but it's exact the moment that
 * timer is stopped and its entry written.
 */
export function useTaskSeconds(taskId: string): number {
  return useLiveQuery(() => getTaskSeconds(taskId), [taskId], 0) ?? 0;
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
