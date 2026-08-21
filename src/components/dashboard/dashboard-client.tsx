"use client";

import { endOfDay, endOfWeek, format, startOfDay, startOfWeek } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { SegmentedBarChart } from "@/components/charts/segmented-bar-chart";
import { Timer } from "@/components/time-tracker/timer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildSegmentedDays,
  hasExcludedTag,
  toProjectBreakdown,
  type WorkLogSegment,
} from "@/lib/charts/segments";
import { BREAK_TAG } from "@/lib/notifications/settings";
import { getStatusColor } from "@/lib/charts/theme";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import type { SegmentSourceEntry } from "@/lib/charts/segments";
import { getActiveTimerElapsedSec, useTimerStore } from "@/lib/stores/timer-store";
import { formatDuration } from "@/lib/utils";

/** Tags whose entries are records, not work: excluded from every work total. */
const WORK_EXCLUDED_TAGS = [BREAK_TAG];

export function DashboardClient() {
  const router = useRouter();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(today);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const { entries: todayEntries } = useTimeEntries({
    from: today.toISOString(),
    to: todayEnd.toISOString(),
  });
  const { entries: weekEntries } = useTimeEntries({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  });
  const { entries: allEntries } = useTimeEntries();
  const { timers } = useTimerStore();

  // Represent any live timers as running (open-ended) segments so the chart
  // shows in-flight work alongside completed logs.
  const runningEntries = useMemo<SegmentSourceEntry[]>(
    () =>
      timers.map((timer) => ({
        id: `running-${timer.id}`,
        title: timer.title,
        notes: timer.notes ?? null,
        projectId: timer.projectId ?? null,
        categoryId: timer.categoryId ?? null,
        startAt: timer.startTime,
        endAt: null,
        durationSec: getActiveTimerElapsedSec(timer),
        tags: timer.tags,
        status: "running" as const,
      })),
    [timers],
  );

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  // Breaks are logged as real entries so they can be audited on /log, but they
  // are not work — counting them here would inflate today's total.
  const totalTodaySeconds = todayEntries.reduce(
    (sum, entry) => (hasExcludedTag(entry, WORK_EXCLUDED_TAGS) ? sum : sum + (entry.durationSec || 0)),
    0,
  );
  const totalTodayBreakSeconds = todayEntries.reduce(
    (sum, entry) => (hasExcludedTag(entry, WORK_EXCLUDED_TAGS) ? sum + (entry.durationSec || 0) : sum),
    0,
  );
  const weekDays = useMemo(
    () =>
      buildSegmentedDays({
        entries: [...weekEntries, ...runningEntries],
        projectMap,
        categoryMap,
        interval: { start: weekStart, end: weekEnd },
        labelFormat: "weekday",
        excludeTags: WORK_EXCLUDED_TAGS,
      }),
    [weekEntries, runningEntries, projectMap, categoryMap, weekStart, weekEnd],
  );

  const legendItems = useMemo(() => {
    const breakdown = toProjectBreakdown(weekDays);
    const items = breakdown.slice(0, 6).map((item) => ({
      key: item.key,
      label: item.name,
      color: item.color,
      value: formatDuration(item.seconds),
    }));
    // Append a "Running" legend entry when a live log is present this week.
    if (weekDays.some((day) => day.hasRunning)) {
      items.push({
        key: "running",
        label: "Running",
        color: getStatusColor("running"),
        value: "",
        live: true,
      } as (typeof items)[number] & { live: boolean });
    }
    return items;
  }, [weekDays]);

  const handleSegmentClick = useCallback(
    (segment: WorkLogSegment) => {
      const day = segment.startAt ? format(new Date(segment.startAt), "yyyy-MM-dd") : "";
      router.push(day ? `/log?date=${day}` : "/log");
    },
    [router],
  );

  const recentEntries = useMemo(
    () => allEntries.slice(0, 5).map((entry) => ({
      ...entry,
      project: entry.projectId ? projectMap.get(entry.projectId) || null : null,
      category: entry.categoryId ? categoryMap.get(entry.categoryId) || null : null,
    })),
    [allEntries, categoryMap, projectMap],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-primary">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your work pulse</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Track momentum today, notice trends this week, and capture your next focused block.
          </p>
        </div>
        <Badge variant="secondary" className="rounded-full px-3 py-1">Local-first</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="minimal-panel">
          <CardHeader>
            <CardDescription>Today’s total</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{formatDuration(totalTodaySeconds)}</CardTitle>
            {/* Break time is excluded from the total above, but shown rather than
                hidden — silently dropping it would look like lost time. */}
            {totalTodayBreakSeconds > 0 ? (
              <CardDescription className="tabular-nums">
                plus {formatDuration(totalTodayBreakSeconds)} on breaks
              </CardDescription>
            ) : null}
          </CardHeader>
        </Card>
        <Card className="minimal-panel">
          <CardHeader>
            <CardDescription>Entries today</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{todayEntries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="minimal-panel">
          <CardHeader>
            <CardDescription>Quick action</CardDescription>
            <CardTitle className="text-xl">Start a timer below</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Timer />
        <ChartCard
          title="This week"
          description="Each block is a work log — hover for details, click to open that day."
          footer={legendItems.length ? <ChartLegend items={legendItems} /> : undefined}
        >
          <SegmentedBarChart
            days={weekDays}
            onSegmentClick={handleSegmentClick}
            emptyTitle="No sessions this week"
            emptyDescription="Start a timer or add a manual entry to see your week take shape."
          />
        </ChartCard>
      </div>

      <Card className="minimal-panel">
        <CardHeader>
          <CardTitle>Recent time entries</CardTitle>
          <CardDescription>Your latest captured sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentEntries.length ? (
            recentEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/55 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.project?.name || "Unassigned"}
                    {entry.category ? ` • ${entry.category.name}` : ""}
                  </p>
                </div>
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {formatDuration(entry.durationSec || 0)}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent entries yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
