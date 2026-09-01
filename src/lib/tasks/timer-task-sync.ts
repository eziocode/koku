import { kokuDb } from "@/lib/storage/db";
import { completeTask, updateTask } from "@/lib/tasks/tasks";
import type { ActiveTimer } from "@/lib/stores/timer-types";

/**
 * Keeps a task's status in sync with the timer tracking time against it.
 *
 * Fire-and-forget (mirrors the `void syncRow(...)` pattern already used in
 * `tasks.ts`/`time-entries.ts`): called synchronously from timer-store
 * actions, which cannot themselves be async.
 */

function hasOtherRunningTimer(taskId: string, otherTimers: ActiveTimer[]): boolean {
  return otherTimers.some((timer) => timer.taskId === taskId && !timer.pausedAt);
}

export async function onTimerStarted(taskId?: string | null): Promise<void> {
  if (!taskId) return;

  const task = await kokuDb.tasks.get(taskId);
  if (!task) return;

  if (task.status === "open" || task.status === "paused") {
    await updateTask(taskId, { status: "in_progress" });
  }
}

export async function onTimerPaused(taskId: string | null | undefined, otherTimers: ActiveTimer[]): Promise<void> {
  if (!taskId) return;
  if (hasOtherRunningTimer(taskId, otherTimers)) return;

  const task = await kokuDb.tasks.get(taskId);
  if (!task) return;

  if (task.status === "in_progress") {
    await updateTask(taskId, { status: "paused" });
  }
}

export async function onTimerResumed(taskId?: string | null): Promise<void> {
  if (!taskId) return;

  const task = await kokuDb.tasks.get(taskId);
  if (!task) return;

  if (task.status === "paused") {
    await updateTask(taskId, { status: "in_progress" });
  }
}

export async function onTimerStopped(taskId: string | null | undefined, otherTimers: ActiveTimer[]): Promise<void> {
  if (!taskId) return;
  if (hasOtherRunningTimer(taskId, otherTimers)) return;

  const task = await kokuDb.tasks.get(taskId);
  if (!task || task.status === "done") return;

  if (task.timerOrigin) {
    await completeTask(taskId);
  } else {
    await updateTask(taskId, { status: "paused" });
  }
}
