"use client";

import { FormEvent, useRef, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";

interface SelectOption {
  id: string;
  name: string;
}

interface EntryFormProps {
  projects: SelectOption[];
  categories: SelectOption[];
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
  projects,
  categories,
  entryId,
  submitLabel = "Save entry",
  showSaveAndNew = false,
  onSuccess,
  onSuccessNew,
  defaultValues,
}: EntryFormProps) {
  const { createEntry, updateEntry } = useTimeEntries();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  // Tracks whether the next submission should stay open for a new entry.
  const saveAndNewRef = useRef(false);

  const initialStart = useMemo(
    () => defaultValues?.startAt || new Date().toISOString(),
    [defaultValues?.startAt],
  );
  const [title, setTitle] = useState(defaultValues?.title || "");
  const [projectId, setProjectId] = useState(defaultValues?.projectId || "none");
  const [categoryId, setCategoryId] = useState(defaultValues?.categoryId || "none");
  const [startAt, setStartAt] = useState(toDateTimeLocal(initialStart));
  const [endAt, setEndAt] = useState(toDateTimeLocal(defaultValues?.endAt));
  const [tags, setTags] = useState((defaultValues?.tags || []).join(", "));
  const [notes, setNotes] = useState(defaultValues?.notes || "");

  function validateTimes(start: string, end: string) {
    if (!end) return true;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
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
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
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
        <div className="space-y-2">
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
        </div>
        <div className="space-y-2">
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
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entry-start">Start time</Label>
          <DateTimePicker
            id="entry-start"
            value={startAt}
            onChange={(v) => {
              setStartAt(v);
              if (timeError) validateTimes(v, endAt);
            }}
            placeholder="Pick start date & time"
            className="w-full"
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
              if (timeError) validateTimes(startAt, v);
            }}
            placeholder="Pick end date & time"
            className="w-full"
          />
        </div>
      </div>
      {timeError ? (
        <p className="text-sm text-destructive">{timeError}</p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="entry-tags">Tags</Label>
        <Input id="entry-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="meeting, design, review" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="entry-notes">Notes</Label>
        <Textarea id="entry-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add helpful context or outcome notes." />
      </div>
      <div className={showSaveAndNew ? "flex gap-3" : undefined}>
        {showSaveAndNew ? (
          <Button
            type="submit"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => { saveAndNewRef.current = true; }}
            className="flex-1"
          >
            Save &amp; New
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={isSubmitting}
          className={showSaveAndNew ? "flex-1" : undefined}
        >
          {showSaveAndNew ? "Save" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
