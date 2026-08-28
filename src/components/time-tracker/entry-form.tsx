"use client";

import { FormEvent, useRef, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toast";
import { QuickCreateCategoryDialog, QuickCreateProjectDialog } from "@/components/time-tracker/quick-create-dialog";
import { TitleSuggestionBar } from "@/components/time-tracker/title-suggestion-bar";
import { useTitleAutofill } from "@/components/time-tracker/use-title-autofill";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTagSuggestions } from "@/lib/storage/hooks/use-tag-suggestions";
import { useTasks } from "@/lib/storage/hooks/use-tasks";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { NONE_VALUE } from "@/lib/ui/list-thresholds";

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
  const { createEntry, updateEntry } = useTimeEntries();
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
  const [projectId, setProjectId] = useState(defaultValues?.projectId || NONE_VALUE);
  const [categoryId, setCategoryId] = useState(defaultValues?.categoryId || NONE_VALUE);
  const [taskId, setTaskId] = useState(defaultValues?.taskId || NONE_VALUE);
  const [startAt, setStartAt] = useState(toDateTimeLocal(initialStart));
  const [endAt, setEndAt] = useState(toDateTimeLocal(defaultValues?.endAt));
  const [tags, setTags] = useState<string[]>(defaultValues?.tags || []);
  const [notes, setNotes] = useState(defaultValues?.notes || "");

  const tagSuggestions = useTagSuggestions();

  const projectOptions: ComboboxOption[] = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.name, color: project.color })),
    [projects],
  );
  const categoryOptions: ComboboxOption[] = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name, color: category.color })),
    [categories],
  );
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const taskOptions: ComboboxOption[] = useMemo(
    () =>
      pickerTasks.map((task) => {
        const projectName = task.projectId ? projectNameById.get(task.projectId) : undefined;
        return { value: task.id, label: task.title, keywords: projectName ? [projectName] : undefined };
      }),
    [pickerTasks, projectNameById],
  );
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const titleAutofill = useTitleAutofill({
    isCreating: !entryId,
    title,
    projectId,
    categoryId,
    tags,
    onProjectIdChange: setProjectId,
    onCategoryIdChange: setCategoryId,
    onTagsChange: setTags,
  });

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
        projectId: projectId === NONE_VALUE ? null : projectId,
        categoryId: categoryId === NONE_VALUE ? null : categoryId,
        taskId: taskId === NONE_VALUE ? null : taskId,
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
        titleAutofill.reset();
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
        {titleAutofill.suggestion && (
          <TitleSuggestionBar
            suggestion={titleAutofill.suggestion}
            projectName={titleAutofill.suggestion.projectId ? projectNameById.get(titleAutofill.suggestion.projectId) ?? null : null}
            categoryName={titleAutofill.suggestion.categoryId ? categoryNameById.get(titleAutofill.suggestion.categoryId) ?? null : null}
            onApply={titleAutofill.apply}
            onDismiss={titleAutofill.dismiss}
          />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="entry-project">Project</Label>
          <Combobox
            id="entry-project"
            options={projectOptions}
            value={projectId}
            onValueChange={setProjectId}
            placeholder="Choose project"
            noneOption={{ value: NONE_VALUE, label: "No project" }}
          />
          <button
            type="button"
            onClick={() => setCreateProjectOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            + New project
          </button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entry-category">Category</Label>
          <Combobox
            id="entry-category"
            options={categoryOptions}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder="Choose category"
            noneOption={{ value: NONE_VALUE, label: "No category" }}
          />
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
          <Label htmlFor="entry-task">Log time against a task</Label>
          <Combobox
            id="entry-task"
            options={taskOptions}
            value={taskId}
            onValueChange={setTaskId}
            placeholder="No task"
            noneOption={{ value: NONE_VALUE, label: "No task" }}
          />
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
