"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type Task } from "@/lib/storage/db";
import {
  completeTask,
  createTask,
  deleteTask,
  moveTask,
  reopenTask,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/lib/tasks/tasks";

const EMPTY_TASKS: Task[] = [];

export function useTasks() {
  const tasks = useLiveQuery(
    () => kokuDb.tasks.orderBy("sortOrder").toArray(),
    [],
    EMPTY_TASKS,
  );

  // Closed tasks drop out of "log time against" until reopened — reopening
  // sets status back to "open", so this one filter is the whole rule.
  const pickerTasks = tasks.filter((task) => task.status !== "done");

  return {
    tasks,
    pickerTasks,
    createTask: (data: CreateTaskInput) => createTask(data),
    updateTask: (id: string, data: UpdateTaskInput) => updateTask(id, data),
    completeTask: (id: string) => completeTask(id),
    reopenTask: (id: string) => reopenTask(id),
    moveTask: (id: string, status: Task["status"], sortOrder: number) => moveTask(id, status, sortOrder),
    deleteTask: (id: string) => deleteTask(id),
  };
}
