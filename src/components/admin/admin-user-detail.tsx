"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChartLoading } from "@/components/charts/chart-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MarkdownText } from "@/components/ui/markdown-text";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import {
  adminRowsToSegmentEntries,
  formatDate,
  formatDuration,
  dashboardForRange,
  getPresenceStatus,
  tiptapToPlainText,
  type AdminPresence,
  type AdminRow,
  type AdminStats,
  type AdminUser,
  type DashboardData,
} from "@/lib/admin-data";
import { buildSegmentedDays, toProjectBreakdown } from "@/lib/charts/segments";
import { BREAK_TAG } from "@/lib/notifications/settings";
import type { TimeFormat } from "@/lib/settings/schema";
import { kokuDb } from "@/lib/storage/db";
import { syncNow } from "@/lib/sync/sync-engine";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatTime } from "@/lib/time-format";
import { exportToCSV, exportToXLSX } from "@/lib/export";
import { cn } from "@/lib/utils";

const CHART_HEIGHT = 224;
const chartLoader = () => <ChartLoading height={CHART_HEIGHT} />;

const SegmentedBarChart = dynamic(
  () => import("@/components/charts/segmented-bar-chart").then((mod) => mod.SegmentedBarChart),
  { loading: chartLoader },
);
const ProjectPieChart = dynamic(
  () => import("@/components/charts/project-pie-chart").then((mod) => mod.ProjectPieChart),
  { loading: chartLoader },
);

/** Tags that mark an entry as rest, not work — matches `isBreak` in admin-data. */
const WORK_EXCLUDED_TAGS = [BREAK_TAG];

type DetailResponse = {
  user: AdminUser;
  rows: AdminRow[];
  nextCursor: string | null;
  summary: AdminStats;
  dashboard: DashboardData;
  presence?: AdminPresence;
};
type CacheValue = { rows: AdminRow[]; nextCursor: string | null; dashboard?: DashboardData };
type ReportResponse = { rows: AdminRow[]; nextCursor: string | null };

function dayShift(day: string, amount: number) {
  const date = new Date(day + "T12:00:00");
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function localEntriesForDay(date: string): Promise<AdminRow[]> {
  const from = new Date(`${date}T00:00:00`).toISOString();
  const to = new Date(`${date}T23:59:59.999`).toISOString();
  const entries = await kokuDb.timeEntries
    .where("startAt")
    .between(from, to, true, true)
    .toArray();
  return entries
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .map((e) => ({ ...e, table: "timeEntries" } as AdminRow));
}

async function localNotesForDay(date: string): Promise<AdminRow[]> {
  const from = new Date(`${date}T00:00:00`).toISOString();
  const to = new Date(`${date}T23:59:59.999`).toISOString();
  const all = await kokuDb.notes.orderBy("updatedAt").reverse().toArray();
  return all
    .filter((n) => n.updatedAt >= from && n.updatedAt <= to)
    .map((n) => ({ ...n, table: "notes" } as AdminRow));
}

async function localReportRows(start: string, end: string): Promise<AdminRow[]> {
  const [entries, notes] = await Promise.all([
    kokuDb.timeEntries.toArray(),
    kokuDb.notes.toArray(),
  ]);
  const from = `${start}T00:00:00`;
  const until = `${end}T23:59:59.999`;
  return [
    ...entries.filter((row) => row.startAt >= from && row.startAt <= until).map((row) => ({ ...row, table: "timeEntries" } as AdminRow)),
    ...notes.filter((row) => row.updatedAt >= from && row.updatedAt <= until).map((row) => ({ ...row, table: "notes" } as AdminRow)),
  ].sort((a, b) => String(b.startAt ?? b.updatedAt).localeCompare(String(a.startAt ?? a.updatedAt)));
}

function daysBetween(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day <= end; day = dayShift(day, 1)) days.push(day);
  return days;
}

async function localFirstActivity(): Promise<string | null> {
  const oldest = await kokuDb.timeEntries.orderBy("startAt").first();
  return oldest?.startAt ? oldest.startAt.slice(0, 10) : null;
}

/** Tasks aren't day-scoped like entries/notes, so this filters by the From/To range instead of a single day. */
async function localTasksForRange(start: string, end: string): Promise<AdminRow[]> {
  const from = `${start}T00:00:00`;
  const until = `${end}T23:59:59.999`;
  const all = await kokuDb.tasks.orderBy("updatedAt").reverse().toArray();
  return all
    .filter((task) => task.createdAt >= from && task.createdAt <= until)
    .map((task) => ({ ...task, table: "tasks" } as AdminRow));
}

export function AdminUserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const today = localToday();
  const { value: timeFormat } = useTypedSetting("timeFormat");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [summary, setSummary] = useState<AdminStats | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  /** Same shape as `dashboard`, but spanning the whole From/To range — feeds the charts. */
  const [rangeDashboard, setRangeDashboard] = useState<DashboardData | null>(null);
  const [presence, setPresence] = useState<AdminPresence>();

  const [rangeStart, setRangeStart] = useState(dayShift(today, -29));
  const [rangeEnd, setRangeEnd] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportRows, setReportRows] = useState<AdminRow[]>([]);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLoadingMore, setReportLoadingMore] = useState(false);

  const [logs, setLogs] = useState<AdminRow[]>([]);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [logLoadingMore, setLogLoadingMore] = useState(false);

  const [notes, setNotes] = useState<AdminRow[]>([]);
  const [noteCursor, setNoteCursor] = useState<string | null>(null);
  const [noteLoadingMore, setNoteLoadingMore] = useState(false);

  const [tasks, setTasks] = useState<AdminRow[]>([]);
  const [taskCursor, setTaskCursor] = useState<string | null>(null);
  const [taskLoadingMore, setTaskLoadingMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [noDataConfirmed, setNoDataConfirmed] = useState(false);
  const [earliestDataDate, setEarliestDataDate] = useState<string | null>(null);
  const cache = useRef(new Map<string, CacheValue>());
  const requestVersion = useRef(0);
  const isOwnProfile = currentUserId !== null && currentUserId === userId;

  const start = rangeStart;

  const reportDays = useMemo(() => daysBetween(rangeStart, rangeEnd), [rangeEnd, rangeStart]);

  const loadReport = useCallback(async (cursor?: string | null) => {
    const loadingMore = Boolean(cursor);
    if (loadingMore) setReportLoadingMore(true); else setReportLoading(true);
    if (!cursor) setReportOpen(true);
    try {
      let value: ReportResponse;
      if (isOwnProfile) {
        const all = await localReportRows(rangeStart, rangeEnd);
        const offset = Number(cursor ?? 0);
        value = { rows: all.slice(offset, offset + 50), nextCursor: offset + 50 < all.length ? String(offset + 50) : null };
      } else {
        const response = await fetch(`/api/admin?userId=${encodeURIComponent(userId)}&table=all&start=${rangeStart}&end=${rangeEnd}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load report");
        value = (await response.json()) as ReportResponse;
      }
      setReportRows((old) => cursor ? [...old, ...value.rows] : value.rows);
      setReportCursor(value.nextCursor);
    } catch (error) {
      if (!cursor) setReportOpen(false);
      toast.error(error instanceof Error ? error.message : "Unable to load report");
    } finally {
      setReportLoading(false);
      setReportLoadingMore(false);
    }
  }, [isOwnProfile, rangeEnd, rangeStart, userId]);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((b: { user?: { id?: string } | null }) => {
        setCurrentUserId(b.user?.id ?? null);
        setAuthChecked(true);
      })
      .catch(() => {
        setCurrentUserId(null);
        setAuthChecked(true);
      });
  }, []);

  const fetchTable = useCallback(
    async (
      table: "timeEntries" | "notes" | "tasks",
      cursor?: string | null,
      force = false,
      filterStart = start,
      filterEnd = rangeEnd,
      updateMeta = false,
    ): Promise<CacheValue> => {
      const key = [userId, filterStart, filterEnd, table, cursor ?? "0"].join("|");
      if (!force && cache.current.has(key)) return cache.current.get(key)!;

      const query =
        "/api/admin?userId=" +
        encodeURIComponent(userId) +
        "&table=" +
        table +
        "&start=" +
        filterStart +
        "&end=" +
        filterEnd +
        "&limit=25" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");

      const response = await fetch(query, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load user detail");

      const value = (await response.json()) as DetailResponse;
      const result = { rows: value.rows, nextCursor: value.nextCursor, dashboard: value.dashboard };
      cache.current.set(key, result);

      if (updateMeta) {
        setUser(value.user);
        setSummary(value.summary);
        setDashboard(value.dashboard);
        setPresence(value.presence);
        setEarliestDataDate(value.summary.firstActivity
          ? value.summary.firstActivity.slice(0, 10)
          : null);
      }

      return result;
    },
    [rangeEnd, setDashboard, setEarliestDataDate, setPresence, setSummary, setUser, start, userId],
  );

  const localDashboardForSelectedDay = useCallback(async () => {
    const [entries, dayNotes, projects] = await Promise.all([
      localEntriesForDay(selectedDay),
      localNotesForDay(selectedDay),
      kokuDb.projects.toArray(),
    ]);
    return dashboardForRange(
      [
        ...entries,
        ...dayNotes,
        ...projects.map((project) => ({ ...project, table: "projects" } as AdminRow)),
      ],
      `${selectedDay}T00:00:00`,
      `${selectedDay}T23:59:59.999`,
    );
  }, [selectedDay]);

  const localDashboardForRange = useCallback(async () => {
    const [rows, projects] = await Promise.all([
      localReportRows(start, rangeEnd),
      kokuDb.projects.toArray(),
    ]);
    return dashboardForRange(
      [...rows, ...projects.map((project) => ({ ...project, table: "projects" } as AdminRow))],
      `${start}T00:00:00`,
      `${rangeEnd}T23:59:59.999`,
    );
  }, [rangeEnd, start]);

  const projectNameById = useMemo(
    () => new Map((dashboard?.projects ?? []).map((project) => [project.id, project.name])),
    [dashboard],
  );

  const chartDays = useMemo(() => {
    if (!rangeDashboard) return [];
    return buildSegmentedDays({
      entries: adminRowsToSegmentEntries(rangeDashboard.workEntries),
      projectMap: new Map(rangeDashboard.projects.map((project) => [project.id, project])),
      interval: { start: new Date(`${start}T00:00:00`), end: new Date(`${rangeEnd}T00:00:00`) },
      labelFormat: "date",
      excludeTags: WORK_EXCLUDED_TAGS,
    });
  }, [rangeDashboard, rangeEnd, start]);

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

  const load = useCallback(
    async (force = false) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setDayLoading(true);
      setNoDataConfirmed(false);
      setLogs([]);
      setLogCursor(null);
      setNotes([]);
      setNoteCursor(null);
      setTasks([]);
      setTaskCursor(null);
      setDashboard(null);
      setRangeDashboard(null);

      try {
        const statsPromise = fetchTable("timeEntries", null, force, start, rangeEnd, true);
        const tasksPromise = isOwnProfile && !force
          ? localTasksForRange(start, rangeEnd)
          : fetchTable("tasks", null, force, start, rangeEnd);
        const localPromise = isOwnProfile && !force
          ? Promise.all([localEntriesForDay(selectedDay), localNotesForDay(selectedDay)])
          : Promise.all([
              fetchTable("timeEntries", null, force, selectedDay, selectedDay),
              fetchTable("notes", null, force, selectedDay, selectedDay),
            ]);
        const displayResult = await localPromise;
        if (version !== requestVersion.current) return;
        if (isOwnProfile && !force) {
          const [localLogs, localNotes] = displayResult as [AdminRow[], AdminRow[]];
          const localFirst = await localFirstActivity();
          if (localFirst) setEarliestDataDate(localFirst);
          setLogs(localLogs.slice(0, 25));
          setLogCursor(localLogs.length > 25 ? "25" : null);
          setNotes(localNotes.slice(0, 25));
          setNoteCursor(localNotes.length > 25 ? "25" : null);
          setNoDataConfirmed(localLogs.length === 0 && localNotes.length === 0);
        } else {
          const [logResult, noteResult] = displayResult as [CacheValue, CacheValue];
          setLogs(logResult.rows);
          setLogCursor(logResult.nextCursor);
          setNotes(noteResult.rows);
          setNoteCursor(noteResult.nextCursor);
          setNoDataConfirmed(logResult.rows.length === 0 && noteResult.rows.length === 0);
        }
        setDayLoading(false);
        const taskResult = await tasksPromise;
        if (version !== requestVersion.current) return;
        if (isOwnProfile && !force) {
          const localTasks = taskResult as AdminRow[];
          setTasks(localTasks.slice(0, 25));
          setTaskCursor(localTasks.length > 25 ? "25" : null);
        } else {
          const remoteTasks = taskResult as CacheValue;
          setTasks(remoteTasks.rows);
          setTaskCursor(remoteTasks.nextCursor);
        }
        const rangeResult = await statsPromise;
        const rangeData = isOwnProfile && !force
          ? await localDashboardForRange()
          : rangeResult.dashboard ?? null;
        if (version !== requestVersion.current) return;
        setRangeDashboard(rangeData);
        const selectedDashboard = isOwnProfile
          ? await localDashboardForSelectedDay()
          : (await fetchTable("timeEntries", null, force, selectedDay, selectedDay)).dashboard;
        if (version !== requestVersion.current) return;
        setDashboard(selectedDashboard ?? null);
      } catch (error) {
        if (version === requestVersion.current) {
          toast.error(
            error instanceof Error ? error.message : "Unable to load user detail",
          );
        }
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setDayLoading(false);
        }
      }
    },
    [fetchTable, isOwnProfile, localDashboardForRange, localDashboardForSelectedDay, rangeEnd, selectedDay, setDashboard, setDayLoading, setLoading, setLogCursor, setLogs, setNoDataConfirmed, setNoteCursor, setNotes, setRangeDashboard, start],
  );

  useEffect(() => {
    if (authChecked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
  }, [authChecked, load]);

  async function sync() {
    setSyncing(true);
    try {
      await syncNow("local");
      cache.current.clear();
      await load(true);
      toast.success("Current data synced.");
    } catch {
      toast.error("Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function moreTimeLogs() {
    if (!logCursor || logLoadingMore) return;
    if (isOwnProfile) {
      setLogLoadingMore(true);
      try {
        const allLocal = await localEntriesForDay(selectedDay);
        const offset = parseInt(logCursor, 10);
        const next = allLocal.slice(offset, offset + 25);
        setLogs((old) => [...old, ...next]);
        setLogCursor(allLocal.length > offset + 25 ? String(offset + 25) : null);
      } catch { /* fall through */ }
      finally { setLogLoadingMore(false); }
      return;
    }
    setLogLoadingMore(true);
    try {
      const result = await fetchTable("timeEntries", logCursor, false, selectedDay, selectedDay);
      setLogs((old) => [...old, ...result.rows]);
      setLogCursor(result.nextCursor);
    } catch { toast.error("Unable to load more logs."); }
    finally { setLogLoadingMore(false); }
  }

  async function moreNotes() {
    if (!noteCursor || noteLoadingMore) return;
    if (isOwnProfile) {
      setNoteLoadingMore(true);
      try {
        const allLocal = await localNotesForDay(selectedDay);
        const offset = parseInt(noteCursor, 10);
        const next = allLocal.slice(offset, offset + 25);
        setNotes((old) => [...old, ...next]);
        setNoteCursor(allLocal.length > offset + 25 ? String(offset + 25) : null);
      } catch { /* fall through */ }
      finally { setNoteLoadingMore(false); }
      return;
    }
    setNoteLoadingMore(true);
    try {
      const result = await fetchTable("notes", noteCursor, false, selectedDay, selectedDay);
      setNotes((old) => [...old, ...result.rows]);
      setNoteCursor(result.nextCursor);
    } catch { toast.error("Unable to load more notes."); }
    finally { setNoteLoadingMore(false); }
  }

  async function moreTasks() {
    if (!taskCursor || taskLoadingMore) return;
    if (isOwnProfile) {
      setTaskLoadingMore(true);
      try {
        const allLocal = await localTasksForRange(start, rangeEnd);
        const offset = parseInt(taskCursor, 10);
        const next = allLocal.slice(offset, offset + 25);
        setTasks((old) => [...old, ...next]);
        setTaskCursor(allLocal.length > offset + 25 ? String(offset + 25) : null);
      } catch { /* fall through */ }
      finally { setTaskLoadingMore(false); }
      return;
    }
    setTaskLoadingMore(true);
    try {
      const result = await fetchTable("tasks", taskCursor, false, start, rangeEnd);
      setTasks((old) => [...old, ...result.rows]);
      setTaskCursor(result.nextCursor);
    } catch { toast.error("Unable to load more tasks."); }
    finally { setTaskLoadingMore(false); }
  }

  const olderDayDisabled = earliestDataDate === null || selectedDay <= earliestDataDate;
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
          onExportCSV={() => void exportAdminReport(reportRows, "csv", timeFormat)}
          onExportXLSX={() => void exportAdminReport(reportRows, "xlsx", timeFormat)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" onClick={() => router.push("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Admin
          </Button>
          <h1 className="mt-3 text-3xl font-semibold">{user.displayName || user.email}</h1>
          <p className="text-sm text-muted-foreground">{user.email} · Last seen {formatDate(presence?.seenAt, timeFormat)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status === "offline" ? "outline" : "default"}>{statusLabel}</Badge>
          <Button variant="outline" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className="mr-2 h-4 w-4" />{syncing ? "Syncing…" : "Manual Sync"}
          </Button>
        </div>
      </div>

      {/* Explicit date range */}
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

      {/* Day navigator */}
      <div className="flex items-center justify-between rounded-xl border p-3">
        <Button variant="outline" size="sm" disabled={olderDayDisabled}
          onClick={() => setSelectedDay(dayShift(selectedDay, -1))}
          title={olderDayDisabled ? "No older data available" : undefined}>
          Older day
        </Button>
        <Input aria-label="Selected day" type="date" max={today} value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value > today ? today : e.target.value)} className="w-40" />
        <Button variant="outline" size="sm" disabled={selectedDay >= today}
          onClick={() => setSelectedDay(dayShift(selectedDay, 1))}>
          Newer day
        </Button>
      </div>

      {/* Stats + dashboard loading skeleton */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        </div>
      ) : summary && dashboard ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {([
              ["Tracked", formatDuration(summary.totalTrackedDuration)],
              ["Entries", summary.timeEntryCount],
              ["Active days", summary.activeDays],
              ["Projects", summary.projectCount],
              ["Notes", summary.noteCount],
              ["Open tasks", `${summary.openTaskCount} / ${summary.taskCount}`],
            ] as [string, string | number][]).map(([label, value]) => (
              <div key={label} className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Daily work</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2 pr-2">
                    {dashboard.daily.length ? dashboard.daily.map((item) => (
                      <div key={item.day} className="flex justify-between text-sm">
                        <span>{item.day}</span><span>{formatDuration(item.seconds)}</span>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">No work in range.</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Project summary</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2 pr-2">
                    {dashboard.projects.length ? dashboard.projects.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.name}</span><span>{formatDuration(item.seconds)}</span>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">No projects in range.</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Daily activity</CardTitle>
                <p className="text-xs text-muted-foreground">{start} to {rangeEnd}</p>
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
        </>
      ) : null}

      {/* No data banner */}
      {!dayLoading && noDataConfirmed && logs.length === 0 && notes.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No data found for <span className="font-semibold text-foreground">{selectedDay}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a different date or use Manual Sync if data was recently added.
          </p>
        </div>
      )}

      {/* Time logs + Notes + Tasks */}
      {
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <LazyDetailList
            title="Time logs"
            rows={logs}
            loading={dayLoading}
            hasMore={!!logCursor}
            loadingMore={logLoadingMore}
            onMore={() => void moreTimeLogs()}
            render={(row) => {
              const tags = Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : [];
              const projectName = row.projectId ? projectNameById.get(String(row.projectId)) : undefined;
              return (
                <>
                  <p className="font-medium">{String(row.title || "Untitled work")}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(row.startAt, timeFormat)} · {formatDuration(row.durationSec)}</p>
                  {(projectName || tags.length > 0) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {projectName ? <Badge variant="outline">{projectName}</Badge> : null}
                      {tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                  )}
                  {row.notes ? (
                    <MarkdownText text={String(row.notes)} className="mt-1 text-muted-foreground" />
                  ) : null}
                </>
              );
            }}
          />
          <LazyDetailList
            title="Notes"
            rows={notes}
            loading={dayLoading}
            hasMore={!!noteCursor}
            loadingMore={noteLoadingMore}
            onMore={() => void moreNotes()}
            render={(row) => <AdminNoteRow row={row} timeFormat={timeFormat} />}
          />
          <LazyDetailList
            title={`Tasks (${rangeStart} to ${rangeEnd})`}
            rows={tasks}
            loading={loading}
            hasMore={!!taskCursor}
            loadingMore={taskLoadingMore}
            onMore={() => void moreTasks()}
            render={(row) => <AdminTaskRow row={row} timeFormat={timeFormat} today={today} />}
          />
        </div>
      }
    </div>
  );
}

async function exportAdminReport(rows: AdminRow[], format: "csv" | "xlsx", timeFormat: "12h" | "24h" = "24h") {
  const clean = rows.map((row) => ({
    Date: new Date(String(row.startAt ?? row.updatedAt ?? row.createdAt)).toLocaleDateString(),
    Time: formatTime(new Date(String(row.startAt ?? row.updatedAt ?? row.createdAt)), timeFormat),
    Type: row.table === "notes" ? "Note" : "Time log",
    Title: String(row.title ?? (row.table === "notes" ? "Untitled note" : "Untitled work")),
    Project: String(row.projectId ?? "Unassigned"),
    Duration: row.table === "notes" ? "" : formatDuration(row.durationSec),
    Tags: Array.isArray(row.tags) ? row.tags.map(String).join(", ") : "",
    Content: row.table === "notes" ? tiptapToPlainText(row.content).trim() : String(row.notes ?? ""),
  }));
  if (format === "csv") await exportToCSV(clean, "koku-admin-report.csv");
  else await exportToXLSX(clean.map((row) => ({ title: row.Title, startAt: `${row.Date} ${row.Time}`, endAt: null, durationSec: null, projectName: row.Project, categoryName: row.Type, tags: row.Tags ? row.Tags.split(", ") : [], notes: row.Content, createdAt: `${row.Date} ${row.Time}` })), "koku-admin-report.xlsx", timeFormat);
}

function FullRangeReport({
  days,
  rows,
  loading,
  hasMore,
  loadingMore,
  onMore,
  onExportCSV,
  onExportXLSX,
}: {
  days: string[];
  rows: AdminRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const byDay = new Map<string, AdminRow[]>();
  rows.forEach((row) => {
    const value = row.startAt ?? row.updatedAt ?? row.createdAt;
    const day = value ? String(value).slice(0, 10) : "unknown";
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  });
  useEffect(() => {
    if (!hasMore || !sentinelRef.current || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onMore();
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onMore]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Full report by date</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportCSV}>CSV</Button>
          <Button variant="outline" size="sm" onClick={onExportXLSX}>XLSX</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-20 rounded-lg" /> : (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-2">
            {(() => {
              const missing = days.filter((day) => !byDay.has(day));
              return missing.length ? <section className="rounded-lg border border-dashed p-3"><h3 className="text-sm font-semibold">No records on {missing.length} date{missing.length === 1 ? "" : "s"}</h3><p className="mt-1 text-xs text-muted-foreground">{missing.join(", ")}</p></section> : null;
            })()}
            {days.filter((day) => byDay.has(day)).map((day) => {
              const dayRows = byDay.get(day) ?? [];
              return (
                <section key={day} className="space-y-2">
                  <h3 className="border-b pb-1 text-sm font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}</h3>
                  {dayRows.length ? dayRows.map((row, index) => (
                    <div key={String(row.id ?? `${day}-${index}`)} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{String(row.title ?? (row.table === "notes" ? "Untitled note" : "Untitled work"))}</p>
                      {row.table === "notes" ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{tiptapToPlainText(row.content).trim() || "No text"}</p> : <p className="mt-1 text-xs text-muted-foreground">{formatDuration(row.durationSec)}</p>}
                    </div>
                  )) : null}
                </section>
              );
            })}
            {hasMore && <div ref={sentinelRef} className="py-2 text-center"><Button variant="outline" size="sm" onClick={onMore} disabled={loadingMore}>{loadingMore ? "Loading more…" : "Load more"}</Button></div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Quick notes open with a "Logged … " stamp paragraph — see `buildQuickNoteStamp`. */
const NOTE_STAMP_PATTERN = /^Logged .+/;

/**
 * One note in the admin Notes panel.
 *
 * Note content is a TipTap doc flattened to newline-separated lines, and quick
 * notes carry a "Logged … while tracking …" stamp as their first paragraph. That
 * stamp is lifted out as its own metadata line so the body starts with what the
 * user actually wrote, wrapped and clamped rather than truncated to one line.
 */
function AdminNoteRow({ row, timeFormat }: { row: AdminRow; timeFormat: TimeFormat }) {
  const [expanded, setExpanded] = useState(false);

  const { stamp, body } = useMemo(() => {
    const lines = tiptapToPlainText(row.content)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const hasStamp = lines.length > 1 && NOTE_STAMP_PATTERN.test(lines[0]);
    return {
      stamp: hasStamp ? lines[0] : null,
      body: (hasStamp ? lines.slice(1) : lines).join("\n"),
    };
  }, [row.content]);

  const isLong = body.length > 180 || body.includes("\n");

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium text-foreground">
          {String(row.title || "Untitled note")}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDate(row.updatedAt ?? row.createdAt, timeFormat)}
        </p>
      </div>
      {stamp ? <p className="text-xs italic text-muted-foreground/80">{stamp}</p> : null}
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-3",
        )}
      >
        {body || "No text"}
      </p>
      {isLong ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

const TASK_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  paused: "Paused",
  done: "Done",
};
const TASK_PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

/** One task in the admin Tasks panel. */
function AdminTaskRow({ row, timeFormat, today }: { row: AdminRow; timeFormat: TimeFormat; today: string }) {
  const status = String(row.status ?? "open");
  const priority = String(row.priority ?? "medium");
  const dueAt = row.dueAt ? String(row.dueAt) : null;
  const overdue = status !== "done" && dueAt !== null && dueAt.slice(0, 10) < today;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium text-foreground">
          {String(row.title || "Untitled task")}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDate(row.updatedAt ?? row.createdAt, timeFormat)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{TASK_STATUS_LABEL[status] ?? status}</Badge>
        <Badge variant="outline">{TASK_PRIORITY_LABEL[priority] ?? priority} priority</Badge>
        {dueAt ? (
          <Badge variant={overdue ? "destructive" : "outline"}>
            {overdue ? "Overdue" : "Due"} {formatDate(dueAt, timeFormat)}
          </Badge>
        ) : null}
      </div>
      {row.notes ? (
        <MarkdownText text={String(row.notes)} className="text-sm text-muted-foreground" />
      ) : null}
    </div>
  );
}

function LazyDetailList({
  title,
  rows,
  loading,
  hasMore,
  loadingMore,
  onMore,
  render,
}: {
  title: string;
  rows: AdminRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  render: (row: AdminRow) => React.ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) onMore();
      },
      { threshold: 0.1 },
    );
    const el = sentinelRef.current;
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [hasMore, loadingMore, onMore]);

  return (
    <Card className="flex flex-col">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="flex-1 overflow-hidden px-6 pb-6">
        <ScrollArea className="h-80 max-h-[60vh] rounded-lg xl:h-96">
          <div className="space-y-3 pr-2 pt-1">
            {loading ? (
              [1, 2, 3].map((item) => <Skeleton key={item} className="h-16 rounded-lg" />)
            ) : rows.length ? (
              rows.map((row, index) => (
                <div key={String(row.id ?? index)} className="min-w-0 rounded-lg border p-3 text-sm text-muted-foreground">
                  {render(row)}
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No records.</p>
            )}
            {hasMore && (
              <div ref={sentinelRef} className="py-2 text-center">
                {loadingMore ? (
                  <span className="text-xs text-muted-foreground">Loading more…</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={onMore} className="text-xs">Load more</Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
