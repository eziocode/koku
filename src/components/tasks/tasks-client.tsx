"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTaskSeconds } from "@/lib/storage/hooks/use-task-seconds";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import type { Task, TaskStatus } from "@/lib/storage/db";
import { cn, formatDuration } from "@/lib/utils";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "paused", label: "Paused" },
  { status: "done", label: "Done" },
];

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

function TaskCard({ task, onOpen, onDragStart }: { task: Task; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const { projects } = useProjects();
  const seconds = useTaskSeconds(task.id);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50"
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{task.title}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {task.dueAt ? <span>Due {format(new Date(task.dueAt), "d MMM")}</span> : null}
        {project ? (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]" style={{ borderColor: project.color, color: project.color }}>
            {project.name}
          </Badge>
        ) : null}
        {seconds > 0 ? <span className="ml-auto font-semibold tabular-nums text-foreground">{formatDuration(seconds)}</span> : null}
      </div>
    </div>
  );
}

export function TasksClient() {
  const { tasks, moveTask } = useTasks();
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>(COLUMNS.map((c) => [c.status, []]));
    for (const task of tasks) {
      map.get(task.status)?.push(task);
    }
    return map;
  }, [tasks]);

  async function handleDrop(status: TaskStatus) {
    setDragOverStatus(null);
    if (!dragTaskId) return;
    const task = tasks.find((t) => t.id === dragTaskId);
    setDragTaskId(null);
    if (!task || task.status === status) return;

    const column = byStatus.get(status) ?? [];
    const maxOrder = column.length ? Math.max(...column.map((t) => t.sortOrder)) : 0;
    await moveTask(task.id, status, maxOrder + 1000);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Tasks</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Board</h1>
          <p className="text-muted-foreground">
            Schedule work, log time against it across many sessions, and close it out when done.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateStatus("open")}>
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((column) => {
          const items = byStatus.get(column.status) ?? [];
          return (
            <Card
              key={column.status}
              className={cn(
                "flex flex-col gap-3 p-3",
                dragOverStatus === column.status && "ring-2 ring-primary/50",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatus(column.status);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === column.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(column.status);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold text-foreground">{column.label}</p>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Nothing here.
                  </p>
                ) : (
                  items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onOpen={() => setDetailTask(task)}
                      onDragStart={() => setDragTaskId(task.id)}
                    />
                  ))
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2 text-muted-foreground"
                onClick={() => setCreateStatus(column.status)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </Button>
            </Card>
          );
        })}
      </div>

      <TaskDetailDialog task={detailTask} onOpenChange={(open) => !open && setDetailTask(null)} />
      <TaskFormDialog
        open={createStatus !== null}
        onOpenChange={(open) => !open && setCreateStatus(null)}
        defaultStatus={createStatus ?? "open"}
      />
    </div>
  );
}
