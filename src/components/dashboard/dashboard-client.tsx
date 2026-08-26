"use client";

import { endOfDay, endOfWeek, format, startOfDay, startOfWeek, subDays } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { DashboardTipCard } from "@/components/dashboard/dashboard-tip-card";
import { QuickCaptureCard } from "@/components/dashboard/quick-capture-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { SegmentedBarChart } from "@/components/charts/segmented-bar-chart";
import { Timer } from "@/components/time-tracker/timer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, ListChecks } from "lucide-react";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildSegmentedDays,
  hasExcludedTag,
  toProjectBreakdown,
  type WorkLogSegment,
} from "@/lib/charts/segments";
import { BREAK_TAG } from "@/lib/notifications/settings";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
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
  // Holidays and week-off days live in notification preferences — the same list
  // that silences check-ins — so the chart labels exactly the days the app
  // already treats as time off.
  const { prefs: notificationPrefs } = useNotificationPreferences();
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
  // "Recent" means the last seven days, this one included. Reaching further back
  // turned the card into an unbounded archive of everything ever logged, which is
  // what /log and /reports are for. The lookback start is used for the same
  // midnight-crossing reason as the windows above.
  // Both bounds are built inline from a fresh clock read: handing a named `Date`
  // local to a helper makes the React Compiler treat it as possibly mutated and
  // bail out of optimising this component entirely.
  const recentWindowStartMs = startOfDay(subDays(new Date(), 6)).getTime();
  const { entries: recentWindowEntries } = useTimeEntries({
    from: getLookbackStart(startOfDay(subDays(new Date(), 6))).toISOString(),
    to: todayEnd.toISOString(),
  });
  const { timers } = useTimerStore();
  const { value: recentEntriesPageSize, setValue: setRecentEntriesPageSize } = useTypedSetting("recentEntriesPageSize");

  // Represent any live timers as open-ended segments so the chart shows in-flight
  // work alongside completed logs. A paused timer is reported as paused, not
  // running: its clock is stopped, and colouring it as live made the week chart
  // claim work was happening when none was.
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
        status: timer.pausedAt ? ("paused" as const) : ("running" as const),
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
        holidayDates: notificationPrefs.holidayDates,
        weekendDays: notificationPrefs.silentDays,
      }),
    [
      weekEntries,
      runningEntries,
      projectMap,
      categoryMap,
      weekStart,
      weekEnd,
      notificationPrefs.holidayDates,
      notificationPrefs.silentDays,
    ],
  );

  const totalWeekSeconds = useMemo(
    () => weekDays.reduce((total, day) => total + day.totalSeconds, 0),
    [weekDays],
  );

  const legendItems = useMemo(() => {
    const breakdown = toProjectBreakdown(weekDays);
    const items = breakdown.slice(0, 6).map((item) => ({
      key: item.key,
      label: item.name,
      color: item.color,
      value: formatDuration(item.seconds),
    }));
    // Append a live legend entry when an in-flight log is present this week, one
    // per state so a paused timer is not passed off as running.
    if (weekDays.some((day) => day.hasRunning)) {
      items.push({
        key: "running",
        label: "Running",
        color: getStatusColor("running"),
        value: "",
        live: true,
      } as (typeof items)[number] & { live: boolean });
    }

    if (weekDays.some((day) => day.hasPaused)) {
      items.push({
        key: "paused",
        label: "Paused",
        color: getStatusColor("paused"),
        value: "",
      });
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
    () =>
      recentWindowEntries
        // The query deliberately over-reaches to catch logs that started before
        // the window and ran into it; anything that ended before it still has to
        // be dropped here.
        .filter((entry) => {
          const endMs = entry.endAt
            ? new Date(entry.endAt).getTime()
            : new Date(entry.startAt).getTime() + (entry.durationSec ?? 0) * 1000;
          return endMs >= recentWindowStartMs;
        })
        .slice()
        .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
        .map((entry) => ({
          ...entry,
          project: entry.projectId ? projectMap.get(entry.projectId) || null : null,
          category: entry.categoryId ? categoryMap.get(entry.categoryId) || null : null,
        })),
    [categoryMap, projectMap, recentWindowEntries, recentWindowStartMs],
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
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-primary" />
              Today’s total
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{formatDuration(totalTodaySeconds)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {/* Break time is excluded from the total above, but shown rather than
                hidden — silently dropping it would look like lost time. */}
            {totalTodayBreakSeconds > 0
              ? `plus ${formatDuration(totalTodayBreakSeconds)} on breaks · ${formatDuration(totalWeekSeconds)} this week`
              : `${formatDuration(totalWeekSeconds)} this week`}
          </CardContent>
        </Card>
        <Card className="minimal-panel">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-primary" />
              Entries today
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{todaySessionCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {todaySessionCount === 0
              ? "Nothing logged yet today"
              : `Average ${formatDuration(Math.round((totalTodaySeconds + totalTodayBreakSeconds) / todaySessionCount))} per entry`}
          </CardContent>
        </Card>
        <DashboardTipCard />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Timer />
        <div className="flex flex-col gap-6">
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
        <QuickCaptureCard />
        </div>
      </div>

      <Card className="minimal-panel">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Recent time entries</CardTitle>
            <CardDescription>
              The last 7 days, newest first. Older work lives on the time log.
            </CardDescription>
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
            empty={
              <p className="text-sm text-muted-foreground">
                Nothing logged in the last 7 days.
              </p>
            }
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
