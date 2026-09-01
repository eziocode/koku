import type { TimeEntry } from "@/lib/storage/db";
import { getActiveTimerElapsedSec } from "@/lib/stores/timer-math";
import type { ActiveTimer } from "@/lib/stores/timer-types";
import { useTimerStore } from "@/lib/stores/timer-store";
import { createTimeEntry, type CreateTimeEntryInput } from "@/lib/time-tracking/time-entries";

/**
 * Stopping a timer, extracted so every surface stops it the same way.
 *
 * Previously this lived as a closure inside the `Timer` component, which meant
 * the mini player, the break runner, and notification actions had no way to stop
 * a timer without duplicating it.
 */

/** Pure: the entry a timer would produce if stopped at `endedAt`. */
export function buildEntryFromTimer(timer: ActiveTimer, endedAt: string): CreateTimeEntryInput {
  return {
    title: timer.title,
    projectId: timer.projectId,
    categoryId: timer.categoryId,
    taskId: timer.taskId,
    startAt: timer.originalStartTime,
    endAt: endedAt,
    durationSec: getActiveTimerElapsedSec(timer, Date.parse(endedAt)),
    tags: timer.pomodoroMode ? Array.from(new Set(["pomodoro", ...timer.tags])) : timer.tags,
    notes: timer.notes || (timer.pomodoroMode ? "Pomodoro focus session" : null),
  };
}

export interface StopTimerResult {
  entry: TimeEntry | null;
  stopped: boolean;
}

/**
 * Persists the entry, then removes the timer from the store — in that order.
 *
 * The ordering is load-bearing and must not be "tidied up": if the Dexie write
 * fails, the timer stays active so the user can retry, rather than the tracked
 * time vanishing. Callers surface the failure; they do not need to restore state.
 */
export async function stopTimerAndPersist(
  timerId: string,
  endedAt: string = new Date().toISOString(),
): Promise<StopTimerResult> {
  const timer = useTimerStore.getState().timers.find((item) => item.id === timerId);
  if (!timer) {
    return { entry: null, stopped: false };
  }

  const entry = await createTimeEntry(buildEntryFromTimer(timer, endedAt));
  useTimerStore.getState().stopTimer(timerId);

  return { entry, stopped: true };
}
