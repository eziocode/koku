"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import type { Task, TaskPriority, TaskStatus } from "@/lib/storage/db";

const NONE = "none";

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing task when set; creating a new one otherwise. */
  task?: Task | null;
  /** Column a newly created task lands in. Ignored when editing. */
  defaultStatus?: TaskStatus;
}

/**
 * Only mounted while `open`, keyed by `task?.id` from the parent — that's
 * what lets every field start from `task`'s current values with a plain
 * `useState` initializer instead of a state-syncing effect (Radix unmounts
 * dialog content on close, so nothing needs to reset itself on `open` toggling
 * back to false either).
 */
function TaskFormBody({
  onOpenChange,
  task,
  defaultStatus,
}: {
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  defaultStatus: TaskStatus;
}) {
  const { createTask, updateTask } = useTasks();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { value: timeFormat } = useTypedSetting("timeFormat");

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.slice(0, 16) : "");
  const [startAt, setStartAt] = useState(task?.startAt ? task.startAt.slice(0, 16) : "");
  const [projectId, setProjectId] = useState(task?.projectId ?? NONE);
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? NONE);
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Give the task a title.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        notes: notes.trim() || null,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        projectId: projectId === NONE ? null : projectId,
        categoryId: categoryId === NONE ? null : categoryId,
        tags,
      };

      if (task) {
        await updateTask(task.id, payload);
        toast.success("Task updated.");
      } else {
        await createTask({ ...payload, status: defaultStatus });
        toast.success("Task created.");
      }
      onOpenChange(false);
    } catch {
      toast.error("Unable to save this task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        <DialogDescription>
          Log time against this task from the timer or a manual entry — even across many
          separate sessions.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Title</Label>
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ship the Q3 report" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-notes">Description</Label>
          <RichTextarea id="task-notes" value={notes} onChange={setNotes} rows={3} placeholder="Optional details…" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due">Due</Label>
            <DateTimePicker id="task-due" value={dueAt} onChange={setDueAt} timeFormat={timeFormat} placeholder="No due date" className="w-full" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-start">Scheduled start</Label>
          <DateTimePicker id="task-start" value={startAt} onChange={setStartAt} timeFormat={timeFormat} placeholder="Not scheduled" className="w-full" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-tags">Tags</Label>
          <TagInput id="task-tags" value={tags} onChange={setTags} placeholder="Add tag…" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {task ? "Save changes" : "Create task"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function TaskFormDialog({ open, onOpenChange, task, defaultStatus = "open" }: TaskFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <TaskFormBody key={task?.id ?? "new"} onOpenChange={onOpenChange} task={task} defaultStatus={defaultStatus} />
      ) : null}
    </Dialog>
  );
}
