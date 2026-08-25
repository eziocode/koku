"use client";

import { endOfDay, endOfWeek, format, startOfDay, startOfWeek } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { SegmentedBarChart } from "@/components/charts/segmented-bar-chart";
import { Timer } from "@/components/time-tracker/timer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  entryTouchesDay,
  getEntrySecondsOnDay,
  getLookbackStart,
} from "@/lib/time-tracking/day-slices";
import { formatDuration } from "@/lib/utils";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

/** Tags whose entries are records, not work: excluded from every work total. */
const WORK_EXCLUDED_TAGS = [BREAK_TAG];

export function DashboardClient() {
  const router = useRouter();
  const [cloudConnected, setCloudConnected] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ user?: unknown | null }>)
      .then((body) => setCloudConnected(Boolean(body.user)))
      .catch(() => setCloudConnected(false));
  }, []);
  const { projects } = useProjects();
  const { categories } = useCategories();
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(today);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const todayKey = format(today, "yyyy-MM-dd");
  // Both windows reach back past their own start: a log that began earlier and
  // crossed midnight into the window is indexed under its old `startAt`, so a
  // window-bounded query would miss the hours it contributes here.
  const { entries: todayEntries } = useTimeEntries({
    from: getLookbackStart(new Date()).toISOString(),
    to: todayEnd.toISOString(),
  });
  const { entries: weekEntries } = useTimeEntries({
    from: getLookbackStart(startOfWeek(new Date(), { weekStartsOn: 1 })).toISOString(),
    to: weekEnd.toISOString(),
  });
  const { entries: allEntries } = useTimeEntries();
  const { timers } = useTimerStore();
  const { value: recentEntriesPageSize, setValue: setRecentEntriesPageSize } = useTypedSetting("recentEntriesPageSize");

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
  // are not work — counting them here would inflate today's total. Each log only
  // contributes the seconds it spent *on today*, so a timer left running
  // overnight cannot push a single day past 24 h.
  const { todaySessionCount, totalTodaySeconds, totalTodayBreakSeconds } = useMemo(() => {
    let sessions = 0;
    let work = 0;
    let breaks = 0;

    for (const entry of todayEntries) {
      // The query reaches back before today, so older logs that never touch it
      // must not be counted as today's sessions.
      if (!entryTouchesDay(entry, todayKey)) {
        continue;
      }
      sessions += 1;
      const seconds = getEntrySecondsOnDay(entry, todayKey);
      if (hasExcludedTag(entry, WORK_EXCLUDED_TAGS)) {
        breaks += seconds;
      } else {
        work += seconds;
      }
    }

    return {
      todaySessionCount: sessions,
      totalTodaySeconds: work,
      totalTodayBreakSeconds: breaks,
    };
  }, [todayEntries, todayKey]);

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
    () => allEntries.map((entry) => ({
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
        <Badge variant="secondary" className="rounded-full px-3 py-1">
          {cloudConnected ? "Cloud connected" : "Local-first"}
        </Badge>
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
            <CardTitle className="text-3xl tabular-nums">{todaySessionCount}</CardTitle>
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
            compact
          />
        </ChartCard>
      </div>

      <Card className="minimal-panel">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Recent time entries</CardTitle>
            <CardDescription>Your latest captured sessions.</CardDescription>
          </div>
          <div className="flex items-center gap-2 sm:pt-1">
            <span className="text-xs text-muted-foreground">Show</span>
            <Select
              value={String(recentEntriesPageSize)}
              onValueChange={(value) => void setRecentEntriesPageSize(Number(value) as typeof recentEntriesPageSize)}
            >
              <SelectTrigger className="h-9 w-[8.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[4, 8, 12, 20].map((count) => (
                  <SelectItem key={count} value={String(count)}>{count} at a time</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <LazyScrollList
            key={recentEntriesPageSize}
            items={recentEntries}
            getKey={(entry) => entry.id}
            pageSize={recentEntriesPageSize}
            className="h-[28rem]"
            moreLabel="Load more entries"
            empty={<p className="text-sm text-muted-foreground">No recent entries yet.</p>}
            renderItem={(entry) => (
              <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/55 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.project?.name || "Unassigned"}
                    {entry.category ? ` • ${entry.category.name}` : ""}
                  </p>
                </div>
                <div className="text-sm font-semibold tabular-nums text-foreground">{formatDuration(entry.durationSec || 0)}</div>
              </div>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
