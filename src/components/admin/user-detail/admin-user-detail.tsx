"use client";

import { useMemo } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminRowsToSegmentEntries,
  formatDate,
  formatDuration,
  getPresenceStatus,
} from "@/lib/admin-data";
import { buildSegmentedDays, toProjectBreakdown } from "@/lib/charts/segments";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

import { FullRangeReport, exportAdminReport } from "./full-range-report";
import { ActivityTab } from "./tabs/activity-tab";
import { NotesTab } from "./tabs/notes-tab";
import { OverviewTab } from "./tabs/overview-tab";
import { TasksTab } from "./tabs/tasks-tab";
import { TimeTab } from "./tabs/time-tab";
import { WORK_EXCLUDED_TAGS } from "./types";
import { useAdminUserData } from "./use-admin-user-data";

export function AdminUserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const data = useAdminUserData(userId);

  const {
    today,
    user,
    summary,
    dashboard,
    rangeDashboard,
    presence,
    workSchedule,
    auxRows,
    auxLoading,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    selectedDay,
    setSelectedDay,
    earliestDataDate,
    logs,
    logCursor,
    logLoadingMore,
    moreTimeLogs,
    notes,
    noteCursor,
    noteLoadingMore,
    moreNotes,
    tasks,
    taskCursor,
    taskLoadingMore,
    moreTasks,
    reportOpen,
    setReportOpen,
    reportRows,
    reportCursor,
    reportLoading,
    reportLoadingMore,
    reportDays,
    loadReport,
    loading,
    dayLoading,
    noDataConfirmed,
    syncing,
    sync,
  } = data;

  // Lookups shared by every row renderer. Projects come from the auxiliary
  // fetch rather than the dashboard so a project with no time logged in the
  // range still resolves its name.
  const projectNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const project of rangeDashboard?.projects ?? []) names.set(project.id, project.name);
    for (const row of auxRows.projects) names.set(String(row.id), String(row.name ?? "Untitled project"));
    return names;
  }, [auxRows.projects, rangeDashboard]);

  const categoryNames = useMemo(
    () => new Map(auxRows.categories.map((row) => [String(row.id), String(row.name ?? "Uncategorized")])),
    [auxRows.categories],
  );

  const taskTitles = useMemo(
    () => new Map(tasks.map((row) => [String(row.id), String(row.title ?? "Untitled task")])),
    [tasks],
  );

  const chartDays = useMemo(() => {
    if (!rangeDashboard) return [];
    return buildSegmentedDays({
      entries: adminRowsToSegmentEntries(rangeDashboard.workEntries),
      projectMap: new Map(rangeDashboard.projects.map((project) => [project.id, project])),
      categoryMap: new Map(rangeDashboard.categories.map((category) => [category.id, category])),
      interval: { start: new Date(`${rangeStart}T00:00:00`), end: new Date(`${rangeEnd}T00:00:00`) },
      labelFormat: "date",
      excludeTags: WORK_EXCLUDED_TAGS,
      // Pulled from the target user's own settings so a zero-hour holiday or a
      // booked leave day reads as a day off, exactly as it does on their own
      // Reports page, instead of looking like a missed day.
      holidayDates: workSchedule?.holidayDates,
      leaveDates: workSchedule?.leaveDates,
      weekendDays: workSchedule?.silentDays,
    });
  }, [rangeDashboard, rangeEnd, rangeStart, workSchedule]);

  const chartProjects = useMemo(
    () =>
      toProjectBreakdown(chartDays).map((item) => ({
        name: item.name,
        value: item.hours,
        color: item.color,
        seconds: item.seconds,
      })),
    [chartDays],
  );

  // Summed from the drawn segments, not from `rangeDashboard.totalSeconds`: the
  // day-interval clip can drop the post-midnight tail of an entry that started
  // on the last day of the range, and the donut must match the bars.
  const chartTotalSeconds = useMemo(
    () => chartDays.reduce((total, day) => total + day.totalSeconds, 0),
    [chartDays],
  );

  const status = getPresenceStatus(presence);
  const statusLabel =
    status === "working" ? "Working"
    : status === "break" ? "On break"
    : status === "online" ? "Online"
    : "Offline";

  if (!user && loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">User not found.</p>
          <Button className="mt-4" onClick={() => router.push("/admin")}>Back to Admin</Button>
        </CardContent>
      </Card>
    );
  }

  if (reportOpen) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setReportOpen(false)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to user detail
        </Button>
        <div>
          <p className="text-sm text-muted-foreground">{user.displayName || user.email}</p>
          <h1 className="mt-1 text-3xl font-semibold">Full activity report</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rangeStart} to {rangeEnd}</p>
        </div>
        <FullRangeReport
          days={reportDays}
          rows={reportRows}
          loading={reportLoading}
          hasMore={!!reportCursor}
          loadingMore={reportLoadingMore}
          onMore={() => void loadReport(reportCursor)}
          onExportCSV={() => void exportAdminReport(reportRows, "csv", timeFormat, projectNames)}
          onExportXLSX={() => void exportAdminReport(reportRows, "xlsx", timeFormat, projectNames)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" onClick={() => router.push("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Admin
          </Button>
          <h1 className="mt-3 text-3xl font-semibold">{user.displayName || user.email}</h1>
          <p className="text-sm text-muted-foreground">
            {user.email} · Last seen {formatDate(presence?.seenAt, timeFormat)}
            {summary ? ` · ${formatDuration(summary.totalTrackedDuration)} tracked` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status === "offline" ? "outline" : "default"}>{statusLabel}</Badge>
          <Button variant="outline" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className="mr-2 h-4 w-4" />{syncing ? "Syncing…" : "Manual Sync"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="report-start">From</label>
        <Input id="report-start" aria-label="Report start date" type="date" max={today} value={rangeStart}
          onChange={(e) => setRangeStart(e.target.value > today ? today : e.target.value)} className="w-40" />
        <label className="text-sm text-muted-foreground" htmlFor="report-end">To</label>
        <Input id="report-end" aria-label="Report end date" type="date" max={today} value={rangeEnd}
          onChange={(e) => setRangeEnd(e.target.value > today ? today : e.target.value)} className="w-40" />
        <Button onClick={() => void loadReport()} disabled={reportLoading || rangeStart > rangeEnd}>
          {reportLoading ? "Loading report…" : "View full report"}
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            user={user}
            summary={summary}
            presence={presence}
            workSchedule={workSchedule}
            rangeDashboard={rangeDashboard}
            chartDays={chartDays}
            chartProjects={chartProjects}
            chartTotalSeconds={chartTotalSeconds}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            today={today}
            timeFormat={timeFormat}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="time">
          <TimeTab
            dashboard={dashboard}
            rangeDashboard={rangeDashboard}
            logs={logs}
            logCursor={logCursor}
            logLoadingMore={logLoadingMore}
            onMoreLogs={() => void moreTimeLogs()}
            dayLoading={dayLoading}
            loading={loading}
            noDataConfirmed={noDataConfirmed}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            earliestDataDate={earliestDataDate}
            today={today}
            timeFormat={timeFormat}
            projectNames={projectNames}
            categoryNames={categoryNames}
            taskTitles={taskTitles}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab
            tasks={tasks}
            taskCursor={taskCursor}
            taskLoadingMore={taskLoadingMore}
            onMoreTasks={() => void moreTasks()}
            loading={loading}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            today={today}
            timeFormat={timeFormat}
            projectNames={projectNames}
            categoryNames={categoryNames}
          />
        </TabsContent>

        <TabsContent value="notes">
          <NotesTab
            notes={notes}
            noteCursor={noteCursor}
            noteLoadingMore={noteLoadingMore}
            onMoreNotes={() => void moreNotes()}
            dayLoading={dayLoading}
            noteLinks={auxRows.noteLinks}
            selectedDay={selectedDay}
            timeFormat={timeFormat}
          />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab
            auxRows={auxRows}
            auxLoading={auxLoading}
            rangeDashboard={rangeDashboard}
            timeFormat={timeFormat}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
