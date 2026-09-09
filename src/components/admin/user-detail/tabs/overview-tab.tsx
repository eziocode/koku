"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

import { ChartLoading } from "@/components/charts/chart-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDate,
  formatDuration,
  type AdminPresence,
  type AdminStats,
  type AdminUser,
  type AdminWorkSchedule,
  type DashboardData,
} from "@/lib/admin-data";
import type { SegmentedDay } from "@/lib/charts/segments";
import { toStatusBreakdown } from "@/lib/charts/segments";
import { getStatusColor } from "@/lib/charts/theme";
import { formatPredictedHour, predictWorkWindows } from "@/lib/predictions/work-window";
import type { TimeFormat } from "@/lib/settings/schema";
import { adminRowsToSegmentEntries } from "@/lib/admin-data";

import { StatTile } from "../stat-tile";
import { CHART_HEIGHT } from "../types";

const chartLoader = () => <ChartLoading height={CHART_HEIGHT} />;

const SegmentedBarChart = dynamic(
  () => import("@/components/charts/segmented-bar-chart").then((mod) => mod.SegmentedBarChart),
  { loading: chartLoader },
);
const ProjectPieChart = dynamic(
  () => import("@/components/charts/project-pie-chart").then((mod) => mod.ProjectPieChart),
  { loading: chartLoader },
);
const TrendLineChart = dynamic(
  () => import("@/components/charts/trend-line-chart").then((mod) => mod.TrendLineChart),
  { loading: chartLoader },
);

/** Minutes from local midnight, as the settings store them, rendered as a clock time. */
function minutesToClock(minutes: number) {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Dates in the list that have not passed yet, soonest first. */
function upcoming(dates: string[], today: string, limit = 6) {
  return dates.filter((date) => date >= today).sort().slice(0, limit);
}

export function OverviewTab({
  user,
  summary,
  presence,
  workSchedule,
  rangeDashboard,
  chartDays,
  chartProjects,
  chartTotalSeconds,
  rangeStart,
  rangeEnd,
  today,
  timeFormat,
  loading,
}: {
  user: AdminUser;
  summary: AdminStats | null;
  presence: AdminPresence | undefined;
  workSchedule: AdminWorkSchedule | undefined;
  rangeDashboard: DashboardData | null;
  chartDays: SegmentedDay[];
  chartProjects: Array<{ name: string; value: number; color: string; seconds: number }>;
  chartTotalSeconds: number;
  rangeStart: string;
  rangeEnd: string;
  today: string;
  timeFormat: TimeFormat;
  loading: boolean;
}) {
  const statusSlices = useMemo(
    () => toStatusBreakdown(chartDays, getStatusColor),
    [chartDays],
  );

  const statusData = useMemo(
    () => statusSlices.status.map((slice) => ({
      name: slice.name,
      value: slice.hours,
      color: slice.color,
      seconds: slice.seconds,
      count: slice.count,
    })),
    [statusSlices],
  );

  const trendData = useMemo(
    () => chartDays.map((day) => ({ label: day.label, hours: day.totalHours })),
    [chartDays],
  );

  // Predicted from the selected range rather than all history, so narrowing the
  // From/To dates answers "what did this look like that month".
  const predictions = useMemo(
    () => predictWorkWindows(adminRowsToSegmentEntries(rangeDashboard?.workEntries ?? [])),
    [rangeDashboard],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Name" value={user.displayName || "Not set"} />
            <Field label="Email" value={user.email || "Not set"} />
            <Field label="User ID" value={user.id} mono />
            <Field label="First activity" value={summary?.firstActivity ? formatDate(summary.firstActivity, timeFormat) : "None yet"} />
            <Field label="Latest activity" value={summary?.latestActivity ? formatDate(summary.latestActivity, timeFormat) : "None yet"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Right now</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Last seen" value={presence?.seenAt ? formatDate(presence.seenAt, timeFormat) : "Never"} />
            {presence?.work ? (
              <Field
                label="Working on"
                value={`${presence.work.title}, since ${formatDate(presence.work.startedAt, timeFormat)}`}
              />
            ) : null}
            {presence?.break ? (
              <Field
                label="On break"
                value={`${presence.break.label}, since ${formatDate(presence.break.startedAt, timeFormat)}`}
              />
            ) : null}
            {presence ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Badge variant={presence.visible ? "default" : "outline"}>
                  {presence.visible ? "Tab visible" : "Tab hidden"}
                </Badge>
                <Badge variant={presence.focused ? "default" : "outline"}>
                  {presence.focused ? "Window focused" : "Window unfocused"}
                </Badge>
              </div>
            ) : (
              <p className="text-muted-foreground">No presence recorded for this user yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <StatTile label="Tracked" value={formatDuration(summary.totalTrackedDuration)} hint="Excludes breaks" />
          <StatTile label="Break time" value={formatDuration(summary.breakSeconds)} />
          <StatTile label="Entries" value={summary.timeEntryCount} hint={summary.runningEntryCount > 0 ? `${summary.runningEntryCount} running` : undefined} />
          <StatTile label="Active days" value={summary.activeDays} />
          <StatTile
            label="Average per day"
            value={summary.activeDays > 0 ? formatDuration(Math.round(summary.totalTrackedDuration / summary.activeDays)) : formatDuration(0)}
          />
          <StatTile label="Projects" value={summary.projectCount} />
          <StatTile label="Categories" value={summary.categoryCount} />
          <StatTile label="Notes" value={summary.noteCount} hint={summary.noteLinkCount > 0 ? `${summary.noteLinkCount} links` : undefined} />
          <StatTile label="Open tasks" value={`${summary.openTaskCount} / ${summary.taskCount}`} />
          <StatTile label="Task time" value={formatDuration(summary.taskAccruedSec)} hint="Task stopwatches" />
          <StatTile label="Reminders" value={summary.reminderCount} />
          <StatTile label="Notifications" value={summary.notificationCount} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Work schedule</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {workSchedule ? (
              <>
                <Field
                  label="Notifications"
                  value={workSchedule.enabled ? "On" : "Off"}
                />
                <Field
                  label="Quiet hours"
                  value={workSchedule.quietHours.enabled
                    ? `${minutesToClock(workSchedule.quietHours.startMinute)} to ${minutesToClock(workSchedule.quietHours.endMinute)}`
                    : "Off"}
                />
                <Field
                  label="End of day"
                  value={workSchedule.endOfDay.enabled
                    ? `${workSchedule.endOfDay.logoffTime}, ${workSchedule.endOfDay.gracePeriodMinutes} min grace`
                    : "Off"}
                />
                <Field
                  label="Check ins"
                  value={workSchedule.checkIn.enabled ? `Every ${workSchedule.checkIn.intervalMinutes} min` : "Off"}
                />
                <Field
                  label="Breaks"
                  value={workSchedule.breaks.enabled ? `Default ${workSchedule.breaks.defaultMinutes} min` : "Off"}
                />
                <Field
                  label="Days off"
                  value={workSchedule.silentDays.length
                    ? workSchedule.silentDays.map((day) => WEEKDAY_SHORT[day] ?? day).join(", ")
                    : "None"}
                />
                <Field
                  label="Upcoming holidays"
                  value={upcoming(workSchedule.holidayDates, today).join(", ") || "None"}
                />
                <Field
                  label="Planned leave"
                  value={upcoming(workSchedule.leaveDates, today).join(", ") || "None"}
                />
              </>
            ) : (
              <p className="text-muted-foreground">This user has not synced their schedule settings yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Typical work window</CardTitle>
            <p className="text-xs text-muted-foreground">Median start and end per weekday, from the selected range.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {predictions.length ? predictions.map((prediction) => (
              <div key={prediction.weekday} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{prediction.weekdayLabel}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {formatPredictedHour(prediction.loginHour)} to {formatPredictedHour(prediction.logoffHour)}
                  </span>
                  <Badge variant="outline">{prediction.sampleCount} day{prediction.sampleCount === 1 ? "" : "s"}</Badge>
                </span>
              </div>
            )) : (
              <p className="text-muted-foreground">
                Not enough history in this range to see a pattern. Three days of the same weekday are needed.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Daily activity</CardTitle>
            <p className="text-xs text-muted-foreground">{rangeStart} to {rangeEnd}</p>
          </CardHeader>
          <CardContent>
            <SegmentedBarChart
              days={chartDays}
              height={CHART_HEIGHT}
              emptyTitle="No tracked work in range"
              emptyDescription="Try a wider From/To range, or use Manual Sync if data was recently added."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Project split</CardTitle></CardHeader>
          <CardContent>
            <ProjectPieChart
              data={chartProjects}
              height={CHART_HEIGHT}
              centerLabel="Tracked"
              centerValue={formatDuration(chartTotalSeconds)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Momentum</CardTitle>
            <p className="text-xs text-muted-foreground">Hours tracked per day across the range.</p>
          </CardHeader>
          <CardContent>
            <TrendLineChart data={trendData} height={CHART_HEIGHT} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Status and progress</CardTitle></CardHeader>
          <CardContent>
            <ProjectPieChart
              data={statusData}
              height={CHART_HEIGHT}
              centerLabel="Logs"
              centerValue={String(statusSlices.status.reduce((total, slice) => total + slice.count, 0))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-xs" : "break-words text-right font-medium"}>{value}</span>
    </div>
  );
}
