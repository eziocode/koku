"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTaskSeconds } from "@/lib/storage/hooks/use-task-seconds";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import type { Task, TaskStatus } from "@/lib/storage/db";
import { TASK_STATUS_OPTIONS } from "@/lib/tasks/task-status";
import { cn, formatDuration } from "@/lib/utils";

const COLUMNS = TASK_STATUS_OPTIONS;

/** Gap left between neighbours so an insert is a single write. */
const SORT_STEP = 1000;

/** Payload type carried by the drag, so drops from elsewhere are ignored. */
const DRAG_MIME = "application/x-koku-task";

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

function TaskCard({
  task,
  dragging,
  dropBefore,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
}: {
  task: Task;
  dragging: boolean;
  dropBefore: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: () => void;
  onDropOnCard: () => void;
}) {
  const { projects } = useProjects();
  const seconds = useTaskSeconds(task.id);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  // A drag ends with a click event on the card; without this the card would
  // open its detail dialog every time it is dropped.
  const draggedRef = useRef(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        draggedRef.current = true;
        // Firefox refuses to start a drag until dataTransfer carries something.
        e.dataTransfer.setData(DRAG_MIME, task.id);
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={() => {
        onDragEnd();
        // Let the trailing click fire first, then re-arm.
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverCard();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropOnCard();
      }}
      onClick={() => {
        if (draggedRef.current) return;
        onOpen();
      }}
      className={cn(
        "cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50",
        dragging && "opacity-40",
        dropBefore && "border-t-2 border-t-primary",
      )}
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
  // Held by id, not by value: the dialog then re-reads the live row, so a
  // status change made inside it (or a drag behind it) is reflected instead of
  // showing the snapshot taken when the card was clicked.
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  // Mirrors `dragTaskId` for the handlers: dragstart, dragover and drop can
  // land in one tick, and a state update from dragstart is not visible to the
  // drop handler's closure yet.
  const dragTaskIdRef = useRef<string | null>(null);
  /** Where the dragged card would land: a column, and optionally the card it goes before. */
  const [dropTarget, setDropTarget] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null);

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) ?? null : null;

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>(COLUMNS.map((c) => [c.value, []]));
    for (const task of tasks) {
      map.get(task.status)?.push(task);
    }
    return map;
  }, [tasks]);

  function startDrag(id: string) {
    dragTaskIdRef.current = id;
    setDragTaskId(id);
  }

  function resetDrag() {
    dragTaskIdRef.current = null;
    setDragTaskId(null);
    setDropTarget(null);
  }

  /**
   * Sort order that puts the dragged task at `beforeId`'s slot, or at the end
   * of the column when dropped on empty space. The dragged card is excluded
   * first so a same-column move measures against its new neighbours.
   */
  function orderFor(status: TaskStatus, taskId: string, beforeId: string | null): number {
    const column = (byStatus.get(status) ?? []).filter((t) => t.id !== taskId);
    if (!column.length) return SORT_STEP;

    const index = beforeId ? column.findIndex((t) => t.id === beforeId) : -1;
    if (index === -1) return column[column.length - 1].sortOrder + SORT_STEP;
    if (index === 0) return column[0].sortOrder - SORT_STEP;
    return (column[index - 1].sortOrder + column[index].sortOrder) / 2;
  }

  async function handleDrop(status: TaskStatus, beforeId: string | null) {
    const taskId = dragTaskIdRef.current;
    resetDrag();
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    // Dropped back onto itself changes nothing.
    if (beforeId === taskId) return;

    await moveTask(taskId, status, orderFor(status, taskId, beforeId));
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
          const items = byStatus.get(column.value) ?? [];
          const isDropColumn = dropTarget?.status === column.value;
          return (
            <Card
              key={column.value}
              className={cn(
                "flex flex-col gap-3 p-3",
                isDropColumn && "ring-2 ring-primary/50",
              )}
              onDragOver={(e) => {
                if (!dragTaskIdRef.current) return;
                // preventDefault on every dragover is what marks this a drop zone.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget((t) =>
                  t?.status === column.value && t.beforeId === null ? t : { status: column.value, beforeId: null },
                );
              }}
              onDragLeave={(e) => {
                // Ignore the leave events fired while crossing child cards.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setDropTarget((t) => (t?.status === column.value ? null : t));
              }}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(column.value, null);
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
                      dragging={dragTaskId === task.id}
                      dropBefore={isDropColumn && dropTarget?.beforeId === task.id && dragTaskId !== task.id}
                      onOpen={() => setDetailTaskId(task.id)}
                      onDragStart={() => startDrag(task.id)}
                      onDragEnd={resetDrag}
                      onDragOverCard={() =>
                        setDropTarget((t) =>
                          t?.status === column.value && t.beforeId === task.id
                            ? t
                            : { status: column.value, beforeId: task.id },
                        )
                      }
                      onDropOnCard={() => void handleDrop(column.value, task.id)}
                    />
                  ))
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2 text-muted-foreground"
                onClick={() => setCreateStatus(column.value)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </Button>
            </Card>
          );
        })}
      </div>

      <TaskDetailDialog task={detailTask} onOpenChange={(open) => !open && setDetailTaskId(null)} />
      <TaskFormDialog
        open={createStatus !== null}
        onOpenChange={(open) => !open && setCreateStatus(null)}
        defaultStatus={createStatus ?? "open"}
      />
    </div>
  );
}
