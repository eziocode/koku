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
    createdAt: now,
    updatedAt: now,
  };

  await kokuDb.tasks.add(task);
  void syncRow("tasks", task);
  return task;
}

/**
 * Completion bookkeeping for a status change, shared by `updateTask` and
 * `moveTask` so a status picked in the form and one picked by dragging a card
 * leave the row in the same shape.
 */
function statusTransition(existing: Task, status: TaskStatus, now: string): Partial<Task> {
  if (existing.status === status) return {};
  if (status === "done") return { completedAt: existing.completedAt ?? now };
  return {
    completedAt: null,
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
    ...(data.status ? statusTransition(existing, data.status, now) : {}),
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
  const updated: Task = { ...existing, status: "done", completedAt: now, updatedAt: now };
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
    completedAt: null,
    reopenedAt: now,
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
    ...statusTransition(existing, status, now),
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
