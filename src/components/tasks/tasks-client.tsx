"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { toast } from "@/components/ui/toast";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTaskAccruedSec } from "@/lib/storage/hooks/use-task-seconds";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import type { Task, TaskStatus } from "@/lib/storage/db";
import { TASK_STATUS_OPTIONS } from "@/lib/tasks/task-status";
import { cn, formatDuration } from "@/lib/utils";

const COLUMNS = TASK_STATUS_OPTIONS;

/** Gap left between neighbours so an insert is a single write. */
const SORT_STEP = 1000;

/**
 * Pointer travel, in px, before a press becomes a drag. Below this the gesture
 * is still a click, so opening a card's detail dialog does not demand a
 * perfectly still mouse.
 */
const DRAG_THRESHOLD = 5;

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

/**
 * The board drags on pointer events rather than the HTML5 drag-and-drop API.
 * Native DnD depends on the browser deciding to start a drag from `draggable`,
 * on `dataTransfer` accepting the payload, and on `dragover`/`drop` being
 * delivered at all; privacy-hardened Chromium builds (Ulaa among them) suppress
 * parts of that pipeline, so the board silently refused to move a card there
 * while working everywhere else. Pointer events have no such moving parts, and
 * with pointer capture every move and release comes back to the card that
 * started the gesture regardless of what sits under the cursor.
 */
function TaskCard({
  task,
  dragging,
  dropBefore,
  registerRef,
  onOpen,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  task: Task;
  dragging: boolean;
  dropBefore: boolean;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onOpen: () => void;
  onDragStart: (id: string) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, dropped: boolean) => void;
}) {
  const { projects } = useProjects();
  const seconds = useTaskAccruedSec(task);
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  /** Press origin, held until the pointer crosses the threshold or is released. */
  const pressRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const draggingRef = useRef(false);

  function endGesture(e: React.PointerEvent<HTMLDivElement>, dropped: boolean) {
    const wasDragging = draggingRef.current;
    if (pressRef.current && e.currentTarget.hasPointerCapture(pressRef.current.id)) {
      e.currentTarget.releasePointerCapture(pressRef.current.id);
    }
    pressRef.current = null;
    draggingRef.current = false;
    if (wasDragging) onDragEnd(e.clientX, e.clientY, dropped);
    return wasDragging;
  }

  return (
    <div
      ref={(el) => registerRef(task.id, el)}
      onPointerDown={(e) => {
        // Primary button only, and never touch: a touch drag would have to
        // suppress scrolling on the card to work, which costs more than it buys
        // on a board that is a plain vertical list on small screens.
        if (e.button !== 0 || e.pointerType === "touch") return;
        pressRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const press = pressRef.current;
        if (!press) return;
        if (!draggingRef.current) {
          if (Math.abs(e.clientX - press.x) < DRAG_THRESHOLD && Math.abs(e.clientY - press.y) < DRAG_THRESHOLD) return;
          draggingRef.current = true;
          onDragStart(task.id);
        }
        // Keeps the press from turning into a text selection across the board.
        e.preventDefault();
        onDragMove(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        const wasDragging = endGesture(e, true);
        if (!wasDragging) onOpen();
      }}
      onPointerCancel={(e) => endGesture(e, false)}
      className={cn(
        "cursor-pointer select-none rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50",
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
  /** Cursor position while dragging, for the card ghost that follows it. */
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  /** Where the dragged card would land: a column, and optionally the card it goes before. */
  const [dropTarget, setDropTarget] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null);
  /** Live DOM rects are the pointer drag's only hit-test, so both are tracked. */
  const columnRefs = useRef<Map<TaskStatus, HTMLDivElement>>(new Map());
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) ?? null : null;
  const dragTask = dragTaskId ? tasks.find((t) => t.id === dragTaskId) ?? null : null;

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>(COLUMNS.map((c) => [c.value, []]));
    for (const task of tasks) {
      map.get(task.status)?.push(task);
    }
    return map;
  }, [tasks]);

  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  /**
   * Sort order that puts the dragged task at `beforeId`'s slot, or at the end
   * of the column when dropped past the last card. The dragged card is excluded
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

  /**
   * Column under the point, or the closest one when the point sits in a gutter
   * between columns (or the page padding around them): a real drag crosses
   * those constantly, and a release there should still land somewhere sensible.
   * On a dead-center tie between two columns, prefer the one the task is not
   * already in, so a drop aimed at a gutter midpoint moves the card rather than
   * returning it to where it started.
   */
  function columnAt(x: number, y: number, avoidStatus: TaskStatus | null): TaskStatus | null {
    let best: TaskStatus | null = null;
    let bestDistance = Infinity;
    for (const [status, el] of columnRefs.current) {
      const rect = el.getBoundingClientRect();
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const distance = dx * dx + dy * dy;
      const isTieAwayFromSource = distance === bestDistance && best === avoidStatus && status !== avoidStatus;
      if (distance < bestDistance || isTieAwayFromSource) {
        bestDistance = distance;
        best = status;
      }
    }
    return best;
  }

  /** Column plus insert slot for a pointer position: the first card whose midpoint is below it. */
  function targetFor(x: number, y: number, taskId: string): { status: TaskStatus; beforeId: string | null } | null {
    const sourceStatus = tasks.find((t) => t.id === taskId)?.status ?? null;
    const status = columnAt(x, y, sourceStatus);
    if (!status) return null;

    for (const task of byStatus.get(status) ?? []) {
      if (task.id === taskId) continue;
      const rect = cardRefs.current.get(task.id)?.getBoundingClientRect();
      if (rect && y < rect.top + rect.height / 2) return { status, beforeId: task.id };
    }
    return { status, beforeId: null };
  }

  function handleDragMove(x: number, y: number, taskId: string) {
    setDragPoint({ x, y });
    const target = targetFor(x, y, taskId);
    setDropTarget((current) =>
      current && target && current.status === target.status && current.beforeId === target.beforeId ? current : target,
    );
  }

  async function handleDragEnd(x: number, y: number, dropped: boolean, taskId: string) {
    setDragTaskId(null);
    setDragPoint(null);
    setDropTarget(null);
    // A cancelled gesture (Escape, a system pointer interrupt) leaves the board alone.
    if (!dropped) return;

    const target = targetFor(x, y, taskId);
    // Dropped back onto itself changes nothing.
    if (!target || target.beforeId === taskId) return;

    try {
      await moveTask(taskId, target.status, orderFor(target.status, taskId, target.beforeId));
    } catch {
      toast.error("Unable to move this task.");
    }
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
              ref={(el) => {
                if (el) columnRefs.current.set(column.value, el);
                else columnRefs.current.delete(column.value);
              }}
              className={cn("flex flex-col gap-3 p-3", isDropColumn && "ring-2 ring-primary/50")}
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
                      registerRef={registerCardRef}
                      onOpen={() => setDetailTaskId(task.id)}
                      onDragStart={setDragTaskId}
                      onDragMove={(x, y) => handleDragMove(x, y, task.id)}
                      onDragEnd={(x, y, dropped) => void handleDragEnd(x, y, dropped, task.id)}
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

      {/* A pointer drag gets no browser-supplied drag image, so the board draws
          its own: without it the only feedback is the faded source card. */}
      {dragTask && dragPoint ? (
        <div
          className="pointer-events-none fixed z-50 max-w-56 truncate rounded-xl border border-primary bg-card px-3 py-2 text-sm font-medium text-foreground shadow-lg"
          style={{ left: dragPoint.x + 12, top: dragPoint.y + 12 }}
        >
          {dragTask.title}
        </div>
      ) : null}

      <TaskDetailDialog task={detailTask} onOpenChange={(open) => !open && setDetailTaskId(null)} />
      <TaskFormDialog
        open={createStatus !== null}
        onOpenChange={(open) => !open && setCreateStatus(null)}
        defaultStatus={createStatus ?? "open"}
      />
    </div>
  );
}
