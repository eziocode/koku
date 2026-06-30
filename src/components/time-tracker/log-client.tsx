"use client";

import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { DailyGrid } from "@/components/time-tracker/daily-grid";
import { EntryForm } from "@/components/time-tracker/entry-form";
import { Timer } from "@/components/time-tracker/timer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";

export function LogClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDateValue = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");
  const selectedDate = parseISO(`${selectedDateValue}T00:00:00`);
  const [dateInput, setDateInput] = useState(selectedDateValue);
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { entries } = useTimeEntries({
    from: startOfDay(selectedDate).toISOString(),
    to: endOfDay(selectedDate).toISOString(),
  });

  // Controls the "New manual entry" dialog open state.
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  // Incrementing this key forces EntryForm to remount (blank form) for "Save & New".
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    setDateInput(selectedDateValue);
  }, [selectedDateValue]);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const joinedEntries = useMemo(
    () => entries.map((entry) => ({
      ...entry,
      durationSec: entry.durationSec ?? null,
      endAt: entry.endAt ?? null,
      notes: entry.notes ?? null,
      project: entry.projectId ? projectMap.get(entry.projectId) || null : null,
      category: entry.categoryId ? categoryMap.get(entry.categoryId) || null : null,
    })),
    [categoryMap, entries, projectMap],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(dateInput ? `/log?date=${dateInput}` : "/log");
  }

  const handleSaveSuccess = useCallback(() => {
    setNewEntryOpen(false);
  }, []);

  const handleSaveAndNew = useCallback(() => {
    // Keep dialog open, remount form with a fresh blank slate.
    setFormKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Time Log</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Daily log</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Review the day, add manual entries, and keep your timer running with intention.
          </p>
        </div>
        <form className="flex items-center gap-3" onSubmit={handleSubmit}>
          <Input
            type="date"
            name="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            className="w-[180px]"
          />
          <Button type="submit" variant="outline">Jump</Button>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Timer />
        <Card>
          <CardHeader>
            <CardTitle>Manual entry</CardTitle>
            <CardDescription>Add a session after the fact, cleanly and quickly.</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={newEntryOpen} onOpenChange={setNewEntryOpen}>
              <DialogTrigger asChild>
                <Button>New manual entry</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create time entry</DialogTitle>
                  <DialogDescription>Record work from earlier today or another time block.</DialogDescription>
                </DialogHeader>
                <EntryForm
                  key={formKey}
                  projects={projects}
                  categories={categories}
                  showSaveAndNew
                  onSuccess={handleSaveSuccess}
                  onSuccessNew={handleSaveAndNew}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <DailyGrid entries={joinedEntries} projects={projects} categories={categories} />
    </div>
  );
}
