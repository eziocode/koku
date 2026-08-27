"use client";

import { endOfDay, format, isSameDay, isValid, parseISO, startOfDay, subDays } from "date-fns";
import { Download, GitCompareArrows } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

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
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatTime } from "@/lib/time-format";

function getValidDateParam(value: string | null, fallback: Date) {
  if (!value) {
    return format(fallback, "yyyy-MM-dd");
  }

  const parsed = parseISO(`${value}T00:00:00`);
  if (!isValid(parsed)) return format(fallback, "yyyy-MM-dd");
  const today = startOfDay(new Date());
  return parsed > today ? format(today, "yyyy-MM-dd") : value;
}

function getManualEntryDefaults(selectedDate: Date) {
  const now = new Date();
  const start = new Date(selectedDate);
  start.setHours(now.getHours(), now.getMinutes(), 0, 0);

  const end = new Date(start);
  end.setHours(start.getHours() + 1);

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function LogClient() {
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Date navigation
  const selectedDateValue = getValidDateParam(searchParams.get("date"), new Date());
  const selectedDate = parseISO(`${selectedDateValue}T00:00:00`);
  const isSelectedDateToday = isSameDay(selectedDate, new Date());
  const manualEntryDefaults = useMemo(
    () => getManualEntryDefaults(selectedDate),
    [selectedDate],
  );

  // Compare mode
  const compareMode = searchParams.get("compare") === "1";
  const [compareA, setCompareA] = useState(
    getValidDateParam(searchParams.get("a"), subDays(new Date(), 1)),
  );
  const [compareB, setCompareB] = useState(
    getValidDateParam(searchParams.get("b"), new Date()),
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

  async function handleExportCSV() {
    const rows = joinedEntries.map((e) => ({
      Date: new Date(e.startAt).toLocaleDateString(),
      Start: formatTime(e.startAt, timeFormat),
      End: e.endAt ? formatTime(e.endAt, timeFormat) : "",
      "Duration (h)": ((e.durationSec ?? 0) / 3600).toFixed(2),
      Title: e.title,
      Project: e.project?.name ?? "Unassigned",
      Category: e.category?.name ?? "",
      Tags: e.tags.join(", "),
      Notes: e.notes ?? "",
    }));
    await exportToCSV(rows, `koku-log-${selectedDateValue}.csv`);
  }

  async function handleExportXLSX() {
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
    await exportToXLSX(xlsxEntries, `koku-log-${selectedDateValue}.xlsx`, timeFormat);
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
              value={selectedDateValue}
              onChange={(d) => {
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
          <div className="grid items-start gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            {isSelectedDateToday ? (
              <Timer />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Live timer is for today</CardTitle>
                  <CardDescription>
                    Live tracking records the current time. Use manual entry to log work for {format(selectedDate, "MMM d, yyyy")}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => router.push("/log")}>Go to today&apos;s live timer</Button>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Manual entry</CardTitle>
                <CardDescription>
                  Add a session after the fact, cleanly and quickly.
                  {!isSelectedDateToday ? ` New entries will default to ${format(selectedDate, "MMM d, yyyy")}.` : ""}
                </CardDescription>
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
          <DailyGrid entries={joinedEntries} />
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
            showSaveAndNew
            defaultValues={manualEntryDefaults}
            onSuccess={handleSaveSuccess}
            onSuccessNew={handleSaveAndNew}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
