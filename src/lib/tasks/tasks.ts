import { kokuDb, type Task, type TaskPriority, type TaskStatus } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

/**
 * Framework-free task writes, mirroring `time-tracking/time-entries.ts`: kept
 * apart from `use-tasks.ts` so non-React callers (the timer store, a future
 * notification-driven flow) can create or update a task without mounting a
 * hook.
 */

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  startAt?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  tags?: string[];
  sortOrder?: number;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  startAt?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  tags?: string[];
  sortOrder?: number;
}

const SORT_ORDER_STEP = 1000;

/** Next slot at the end of a status column, spaced so a drag-drop insert is one write. */
export async function nextSortOrder(status: TaskStatus): Promise<number> {
  const last = await kokuDb.tasks.where("status").equals(status).sortBy("sortOrder");
  const max = last.length ? last[last.length - 1].sortOrder : 0;
  return max + SORT_ORDER_STEP;
}

export async function createTask(data: CreateTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const status = data.status ?? "open";
  const task: Task = {
    id: crypto.randomUUID(),
    title: data.title,
    notes: data.notes ?? null,
    status,
    priority: data.priority ?? "medium",
    dueAt: data.dueAt ?? null,
    startAt: data.startAt ?? null,
    projectId: data.projectId ?? null,
    categoryId: data.categoryId ?? null,
    tags: data.tags ?? [],
    completedAt: null,
    reopenedAt: null,
    sortOrder: data.sortOrder ?? (await nextSortOrder(status)),
    accumulatedSec: 0,
    // A task can be created straight into "in_progress" from that column's
    // "Add task" button, so the stopwatch has to start running immediately.
    inProgressSince: status === "in_progress" ? now : null,
    createdAt: now,
    updatedAt: now,
  };

  await kokuDb.tasks.add(task);
  void syncRow("tasks", task);
  return task;
}

/**
 * Completion and accrual bookkeeping for a status change, shared by every
 * write path (`updateTask`, `moveTask`, `completeTask`, `reopenTask`) so a
 * status picked in the form, one picked by dragging a card, and the detail
 * dialog's buttons all leave the row in the same shape.
 *
 * The accumulated-time stopwatch only runs while a task is "in_progress":
 * entering that status starts it (`inProgressSince = now`), leaving it banks
 * the elapsed stretch into `accumulatedSec` and stops the clock. Completing a
 * task always records when it actually finished, overwriting `dueAt` with
 * that moment; reopening clears both `completedAt` and `dueAt` back out so
 * the user can set a fresh deadline (or leave it blank).
 */
function accrualTransition(existing: Task, status: TaskStatus, now: string): Partial<Task> {
  if (existing.status === status) return {};

  const wasRunning = existing.status === "in_progress" && existing.inProgressSince;
  const bankedSec = wasRunning
    ? existing.accumulatedSec + Math.max(0, Math.floor((Date.parse(now) - Date.parse(existing.inProgressSince!)) / 1000))
    : existing.accumulatedSec;

  if (status === "in_progress") {
    return { accumulatedSec: bankedSec, inProgressSince: now };
  }

  if (status === "done") {
    return {
      accumulatedSec: bankedSec,
      inProgressSince: null,
      completedAt: existing.completedAt ?? now,
      dueAt: now,
    };
  }

  return {
    accumulatedSec: bankedSec,
    inProgressSince: null,
    completedAt: null,
    dueAt: existing.status === "done" ? null : existing.dueAt,
    reopenedAt: existing.status === "done" ? now : existing.reopenedAt,
  };
}

/** Every mutation bumps `updatedAt` — it's the field incremental sync pulls on. */
export async function updateTask(id: string, data: UpdateTaskInput): Promise<Task | null> {
  const existing = await kokuDb.tasks.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    ...data,
    ...(data.status ? accrualTransition(existing, data.status, now) : {}),
    updatedAt: now,
  };

  await kokuDb.tasks.put(updated);
  void syncRow("tasks", updated);
  return updated;
}

export async function completeTask(id: string): Promise<Task | null> {
  const existing = await kokuDb.tasks.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    status: "done",
    ...accrualTransition(existing, "done", now),
    updatedAt: now,
  };
  await kokuDb.tasks.put(updated);
  void syncRow("tasks", updated);
  return updated;
}

/** Clears completion and puts the task back in the picker. */
export async function reopenTask(id: string): Promise<Task | null> {
  const existing = await kokuDb.tasks.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    status: "open",
    ...accrualTransition(existing, "open", now),
    updatedAt: now,
  };
  await kokuDb.tasks.put(updated);
  void syncRow("tasks", updated);
  return updated;
}

/** Drag between kanban columns, or a reorder within one. */
export async function moveTask(id: string, status: TaskStatus, sortOrder: number): Promise<Task | null> {
  const existing = await kokuDb.tasks.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    status,
    sortOrder,
    ...accrualTransition(existing, status, now),
    updatedAt: now,
  };
  await kokuDb.tasks.put(updated);
  void syncRow("tasks", updated);
  return updated;
}

export async function deleteTask(id: string): Promise<void> {
  const linked = await kokuDb.transaction("rw", kokuDb.tasks, kokuDb.timeEntries, async () => {
    const entries = await kokuDb.timeEntries.where("taskId").equals(id).toArray();
    for (const entry of entries) {
      await kokuDb.timeEntries.update(entry.id, { taskId: null });
    }
    await kokuDb.tasks.delete(id);
    return entries;
  });

  // Network writes stay outside the Dexie transaction.
  for (const entry of linked) {
    void syncRow("timeEntries", { ...entry, taskId: null });
  }
  void deleteRow("tasks", id);
}
