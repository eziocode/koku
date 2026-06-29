"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

interface SelectOption {
  id: string;
  name: string;
}

interface EntryFormProps {
  projects: SelectOption[];
  categories: SelectOption[];
  endpoint?: string;
  method?: "POST" | "PUT";
  submitLabel?: string;
  onSuccess?: () => void;
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
  endpoint = "/api/time-entries",
  method = "POST",
  submitLabel = "Save entry",
  onSuccess,
  defaultValues,
}: EntryFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      toast.error("Unable to save this entry.");
      return;
    }

    toast.success("Time entry saved.");
    router.refresh();
    onSuccess?.();
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
          <Input id="entry-start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry-end">End time</Label>
          <Input id="entry-end" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="entry-tags">Tags</Label>
        <Input id="entry-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="meeting, design, review" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="entry-notes">Notes</Label>
        <Textarea id="entry-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add helpful context or outcome notes." />
      </div>
      <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
    </form>
  );
}
