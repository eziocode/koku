"use client";

import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
import { Download, GitCompareArrows } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DailyGrid } from "@/components/time-tracker/daily-grid";
import { EntryForm } from "@/components/time-tracker/entry-form";
import { LogCompare } from "@/components/time-tracker/log-compare";
import { DEFAULT_FILTERS, LogFilterState, LogFilters } from "@/components/time-tracker/log-filters";
import { Timer } from "@/components/time-tracker/timer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { exportToCSV, exportToXLSX } from "@/lib/export";

export function LogClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Date navigation
  const selectedDateValue = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");
  const selectedDate = parseISO(`${selectedDateValue}T00:00:00`);
  const [dateInput, setDateInput] = useState(selectedDateValue);

  // Compare mode
  const compareMode = searchParams.get("compare") === "1";
  const [compareA, setCompareA] = useState(
    searchParams.get("a") || format(subDays(new Date(), 1), "yyyy-MM-dd"),
  );
  const [compareB, setCompareB] = useState(
    searchParams.get("b") || format(new Date(), "yyyy-MM-dd"),
  );

  // Smart filters
  const [filters, setFilters] = useState<LogFilterState>(DEFAULT_FILTERS);

  // Dialog state
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const { projects } = useProjects();
  const { categories } = useCategories();

  // Build filter for useTimeEntries — merge date filter with smart filters
  const entryFilters = useMemo(() => {
    const fromDate = filters.from
      ? startOfDay(parseISO(`${filters.from}T00:00:00`)).toISOString()
      : startOfDay(selectedDate).toISOString();
    const toDate = filters.to
      ? endOfDay(parseISO(`${filters.to}T00:00:00`)).toISOString()
      : endOfDay(selectedDate).toISOString();

    return {
      from: fromDate,
      to: toDate,
      projectIds: filters.projectIds.length ? filters.projectIds : undefined,
      categoryIds: filters.categoryIds.length ? filters.categoryIds : undefined,
      tags: filters.tags.length ? filters.tags : undefined,
      minDurationSec: filters.minH > 0 ? filters.minH * 3600 : undefined,
      maxDurationSec: filters.maxH > 0 ? filters.maxH * 3600 : undefined,
      search: filters.q || undefined,
    };
  }, [filters, selectedDate]);

  const { entries } = useTimeEntries(entryFilters);

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
    () =>
      entries.map((entry) => ({
        ...entry,
        durationSec: entry.durationSec ?? null,
        endAt: entry.endAt ?? null,
        notes: entry.notes ?? null,
        project: entry.projectId ? projectMap.get(entry.projectId) || null : null,
        category: entry.categoryId ? categoryMap.get(entry.categoryId) || null : null,
      })),
    [categoryMap, entries, projectMap],
  );


  function toggleCompare() {
    if (compareMode) {
      router.push(selectedDateValue ? `/log?date=${selectedDateValue}` : "/log");
    } else {
      router.push(`/log?compare=1&a=${compareA}&b=${compareB}`);
    }
  }

  const handleSaveSuccess = useCallback(() => setNewEntryOpen(false), []);
  const handleSaveAndNew = useCallback(() => setFormKey((k) => k + 1), []);

  function handleExportCSV() {
    const rows = joinedEntries.map((e) => ({
      Date: new Date(e.startAt).toLocaleDateString(),
      Start: new Date(e.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      End: e.endAt ? new Date(e.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      "Duration (h)": ((e.durationSec ?? 0) / 3600).toFixed(2),
      Title: e.title,
      Project: e.project?.name ?? "Unassigned",
      Category: e.category?.name ?? "",
      Tags: e.tags.join(", "),
      Notes: e.notes ?? "",
    }));
    exportToCSV(rows, `koku-log-${selectedDateValue}.csv`);
  }

  function handleExportXLSX() {
    const xlsxEntries = joinedEntries.map((e) => ({
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      durationSec: e.durationSec,
      projectName: e.project?.name ?? "Unassigned",
      categoryName: e.category?.name ?? null,
      tags: e.tags,
      notes: e.notes,
      createdAt: e.createdAt,
    }));
    exportToXLSX(xlsxEntries, `koku-log-${selectedDateValue}.xlsx`);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Time Log</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Daily log</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Review the day, add manual entries, and keep your timer running with intention.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!compareMode && (
            <DatePicker
              value={dateInput}
              onChange={(d) => {
                setDateInput(d);
                router.push(d ? `/log?date=${d}` : "/log");
              }}
              placeholder="Pick a date"
              className="w-[180px]"
            />
          )}
          <Button
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={toggleCompare}
            className="gap-2"
          >
            <GitCompareArrows className="h-4 w-4" />
            {compareMode ? "Exit compare" : "Compare"}
          </Button>
        </div>
      </div>

      {/* Compare mode */}
      {compareMode ? (
        <LogCompare
          dateA={compareA}
          dateB={compareB}
          onChangeDateA={(d) => {
            setCompareA(d);
            router.replace(`/log?compare=1&a=${d}&b=${compareB}`);
          }}
          onChangeDateB={(d) => {
            setCompareB(d);
            router.replace(`/log?compare=1&a=${compareA}&b=${d}`);
          }}
        />
      ) : (
        <>
          {/* Timer + manual entry */}
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Timer />
            <Card>
              <CardHeader>
                <CardTitle>Manual entry</CardTitle>
                <CardDescription>Add a session after the fact, cleanly and quickly.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button onClick={() => { setFormKey((k) => k + 1); setNewEntryOpen(true); }}>
                  New manual entry
                </Button>
                {joinedEntries.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExportCSV}>
                        Download CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportXLSX}>
                        Download XLSX (4 sheets)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Smart filters */}
          <LogFilters filters={filters} onChange={setFilters} />

          {/* Daily grid */}
          <DailyGrid entries={joinedEntries} projects={projects} categories={categories} />
        </>
      )}

      {/* New entry dialog */}
      <Dialog open={newEntryOpen} onOpenChange={setNewEntryOpen}>
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
    </div>
  );
}
