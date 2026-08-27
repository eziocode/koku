"use client";

import { FormEvent, useRef, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toast";
import { QuickCreateCategoryDialog, QuickCreateProjectDialog } from "@/components/time-tracker/quick-create-dialog";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

interface EntryFormProps {
  entryId?: string;
  submitLabel?: string;
  /** Show a secondary "Save & New" button (for create dialogs). */
  showSaveAndNew?: boolean;
  onSuccess?: () => void;
  /** Called instead of onSuccess when the user clicks "Save & New". */
  onSuccessNew?: () => void;
  defaultValues?: {
    title?: string;
    projectId?: string | null;
    categoryId?: string | null;
    taskId?: string | null;
    startAt?: string;
    endAt?: string | null;
    tags?: string[];
    notes?: string | null;
  };
}

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function EntryForm({
  entryId,
  submitLabel = "Save entry",
  showSaveAndNew = false,
  onSuccess,
  onSuccessNew,
  defaultValues,
}: EntryFormProps) {
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { pickerTasks } = useTasks();
  const { createEntry, updateEntry, entries: allEntries } = useTimeEntries();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  // Tracks whether the next submission should stay open for a new entry.
  const saveAndNewRef = useRef(false);

  const initialStart = useMemo(
    () => defaultValues?.startAt || new Date().toISOString(),
    [defaultValues?.startAt],
  );
  const [title, setTitle] = useState(defaultValues?.title || "");
  const [projectId, setProjectId] = useState(defaultValues?.projectId || "none");
  const [categoryId, setCategoryId] = useState(defaultValues?.categoryId || "none");
  const [taskId, setTaskId] = useState(defaultValues?.taskId || "none");
  const [startAt, setStartAt] = useState(toDateTimeLocal(initialStart));
  const [endAt, setEndAt] = useState(toDateTimeLocal(defaultValues?.endAt));
  const [tags, setTags] = useState<string[]>(defaultValues?.tags || []);
  const [notes, setNotes] = useState(defaultValues?.notes || "");

  const tagSuggestions = useMemo(
    () => Array.from(new Set(allEntries.flatMap((e) => e.tags))).sort(),
    [allEntries],
  );

  /**
   * Runs on every start/end change (not only after a failed submit) so an
   * invalid range is flagged the moment it is picked. `Number.isNaN` guards the
   * empty/unparseable start case, which would otherwise make every comparison
   * against it false and let an invalid range through.
   */
  function validateTimes(start: string, end: string) {
    const startMs = new Date(start).getTime();
    if (Number.isNaN(startMs)) {
      setTimeError("Start time must be a valid date and time.");
      return false;
    }
    if (!end) {
      setTimeError(null);
      return true;
    }
    const endMs = new Date(end).getTime();
    if (Number.isNaN(endMs)) {
      setTimeError("End time must be a valid date and time.");
      return false;
    }
    if (endMs <= startMs) {
      setTimeError("End time must be after start time.");
      return false;
    }
    setTimeError(null);
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateTimes(startAt, endAt)) return;

    setIsSubmitting(true);
    const isSaveAndNew = saveAndNewRef.current;
    saveAndNewRef.current = false;

    try {
      const payload = {
        title,
        projectId: projectId === "none" ? null : projectId,
        categoryId: categoryId === "none" ? null : categoryId,
        taskId: taskId === "none" ? null : taskId,
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        tags,
        notes: notes || null,
      };

      if (entryId) {
        await updateEntry(entryId, payload);
      } else {
        await createEntry(payload);
      }

      toast.success("Time entry saved.");

      if (isSaveAndNew) {
        onSuccessNew?.();
      } else {
        onSuccess?.();
      }
    } catch {
      toast.error("Unable to save this entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="entry-title">Title</Label>
        <Input id="entry-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Design review" required />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setCreateProjectOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            + New project
          </button>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setCreateCategoryOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            + New category
          </button>
        </div>
      </div>
      {pickerTasks.length > 0 && (
        <div className="space-y-1.5">
          <Label>Log time against a task</Label>
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger><SelectValue placeholder="No task" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No task</SelectItem>
              {pickerTasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entry-start">Start time</Label>
          <DateTimePicker
            id="entry-start"
            value={startAt}
            onChange={(v) => {
              setStartAt(v);
              validateTimes(v, endAt);
            }}
            placeholder="Pick start date & time"
            className="w-full"
            timeFormat={timeFormat}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry-end">End time</Label>
          <DateTimePicker
            id="entry-end"
            value={endAt}
            onChange={(v) => {
              setEndAt(v);
              validateTimes(startAt, v);
            }}
            placeholder="Pick end date & time"
            className="w-full"
            timeFormat={timeFormat}
            min={startAt}
          />
        </div>
      </div>
      {timeError ? (
        <p role="alert" className="text-sm text-destructive">{timeError}</p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="entry-tags">Tags</Label>
        <TagInput
          id="entry-tags"
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          placeholder="Add tag…"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="entry-notes">Notes</Label>
        <RichTextarea id="entry-notes" value={notes} onChange={setNotes} placeholder="Add helpful context or outcome notes." />
      </div>
      <div className={showSaveAndNew ? "flex gap-3" : undefined}>
        {showSaveAndNew ? (
          <Button
            type="submit"
            variant="outline"
            disabled={isSubmitting || Boolean(timeError)}
            onClick={() => { saveAndNewRef.current = true; }}
            className="flex-1"
          >
            Save &amp; New
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={isSubmitting || Boolean(timeError)}
          className={showSaveAndNew ? "flex-1" : undefined}
        >
          {showSaveAndNew ? "Save" : submitLabel}
        </Button>
      </div>

      {/* Quick-create dialogs */}
      <QuickCreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(id) => { setProjectId(id); setCreateProjectOpen(false); }}
      />
      <QuickCreateCategoryDialog
        open={createCategoryOpen}
        onOpenChange={setCreateCategoryOpen}
        onCreated={(id) => { setCategoryId(id); setCreateCategoryOpen(false); }}
      />
    </form>
  );
}
