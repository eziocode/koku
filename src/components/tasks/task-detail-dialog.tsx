"use client";

import { format } from "date-fns";
import { CheckCircle2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownText } from "@/components/ui/markdown-text";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTaskAccruedSec, useTaskEntries, useTaskSeconds } from "@/lib/storage/hooks/use-task-seconds";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import type { Task } from "@/lib/storage/db";
import { formatTime } from "@/lib/time-format";
import { formatDuration } from "@/lib/utils";

const PRIORITY_LABEL: Record<Task["priority"], string> = { low: "Low", medium: "Medium", high: "High" };
const STATUS_LABEL: Record<Task["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  paused: "Paused",
  done: "Done",
};

interface TaskDetailDialogProps {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ task, onOpenChange }: TaskDetailDialogProps) {
  const { completeTask, reopenTask, deleteTask } = useTasks();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const [editOpen, setEditOpen] = useState(false);

  const loggedSec = useTaskSeconds(task?.id ?? "");
  const entries = useTaskEntries(task?.id ?? "");
  // Falls back to a static 0 while `task` is null; the real, ticking value
  // takes over on the next render once a task is set (hooks can't be called
  // conditionally, so this can't move below the early return).
  const accruedSec = useTaskAccruedSec(
    task ?? { accumulatedSec: 0, inProgressSince: null, status: "open" } as Task,
  );

  if (!task) return null;

  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const category = task.categoryId ? categories.find((c) => c.id === task.categoryId) : null;

  /** Done/reopen close the dialog: the card behind it has already moved column. */
  async function handleStatusAction(action: (id: string) => Promise<unknown>) {
    if (!task) return;
    await action(task.id);
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!task) return;
    if (!window.confirm("Delete this task? Linked time entries stay, just unlinked.")) return;
    await deleteTask(task.id);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={Boolean(task) && !editOpen} onOpenChange={(open) => !open && onOpenChange(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{STATUS_LABEL[task.status]}</Badge>
              <Badge variant="outline">{PRIORITY_LABEL[task.priority]} priority</Badge>
            </div>
            <DialogTitle>{task.title}</DialogTitle>
            {task.notes ? <MarkdownText text={task.notes} className="text-muted-foreground" /> : null}
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Accumulated time</p>
              <p className="text-lg font-semibold tabular-nums">{formatDuration(accruedSec)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Logged time</p>
              <p className="text-lg font-semibold tabular-nums">{formatDuration(loggedSec)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sessions</p>
              <p className="text-lg font-semibold tabular-nums">{entries.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due</p>
              <p className="text-lg font-semibold">
                {task.dueAt ? `${format(new Date(task.dueAt), "d MMM yyyy")} · ${formatTime(task.dueAt, timeFormat)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled start</p>
              <p className="text-lg font-semibold">{task.startAt ? format(new Date(task.startAt), "d MMM yyyy") : "—"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {project && (
              <Badge variant="outline" style={{ borderColor: project.color, color: project.color }}>{project.name}</Badge>
            )}
            {category && <Badge variant="secondary">{category.name}</Badge>}
            {task.tags.map((tag) => (
              <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
                <Badge className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground">
                  {tag}
                </Badge>
              </Link>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">Time entries</p>
            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                No time logged against this task yet.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{format(new Date(entry.startAt), "d MMM yyyy")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(entry.startAt, timeFormat)}
                        {entry.endAt ? ` - ${formatTime(entry.endAt, timeFormat)}` : " • Running"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatDuration(entry.durationSec ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={() => void handleDelete()}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
            {task.status === "done" ? (
              <Button className="gap-2" onClick={() => void handleStatusAction(reopenTask)}>
                <RotateCcw className="h-4 w-4" />
                Reopen task
              </Button>
            ) : (
              <Button className="gap-2" onClick={() => void handleStatusAction(completeTask)}>
                <CheckCircle2 className="h-4 w-4" />
                Mark done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} task={task} />
    </>
  );
}
