import type { TaskStatus } from "@/lib/storage/db";

/**
 * One source of truth for the kanban columns: the board renders them in this
 * order, and every status picker (task form, quick create) offers the same
 * list, so a task created from a column's "Add task" button and one created
 * from the global button can land in exactly the same set of states.
 */
export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  paused: "Paused",
  done: "Done",
};
