"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import {
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
import { kokuDb } from "@/lib/storage/db";
import { syncNow } from "@/lib/sync/sync-engine";

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

export function AdminUserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [summary, setSummary] = useState<AdminStats | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
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
      setReportOpen(true);
    } catch (error) {
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
      table: "timeEntries" | "notes",
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
      setDashboard(null);

      try {
        const statsPromise = fetchTable("timeEntries", null, force, start, rangeEnd, true);
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
        await statsPromise;
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
    [fetchTable, isOwnProfile, localDashboardForSelectedDay, rangeEnd, selectedDay, setDashboard, setDayLoading, setLoading, setLogCursor, setLogs, setNoDataConfirmed, setNoteCursor, setNotes, start],
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" onClick={() => router.push("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Admin
          </Button>
          <h1 className="mt-3 text-3xl font-semibold">{user.displayName || user.email}</h1>
          <p className="text-sm text-muted-foreground">{user.email} · Last seen {formatDate(presence?.seenAt)}</p>
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
        <Input id="report-start" aria-label="Report start date" type="date" value={rangeStart}
          onChange={(e) => setRangeStart(e.target.value)} className="w-40" />
        <label className="text-sm text-muted-foreground" htmlFor="report-end">To</label>
        <Input id="report-end" aria-label="Report end date" type="date" value={rangeEnd}
          onChange={(e) => setRangeEnd(e.target.value)} className="w-40" />
        <Button onClick={() => void loadReport()} disabled={reportLoading || rangeStart > rangeEnd}>
          {reportLoading ? "Loading report…" : "View full report"}
        </Button>
      </div>

      {reportOpen && (
        <FullRangeReport
          days={reportDays}
          rows={reportRows}
          loading={reportLoading}
          hasMore={!!reportCursor}
          loadingMore={reportLoadingMore}
          onMore={() => void loadReport(reportCursor)}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Day navigator */}
      <div className="flex items-center justify-between rounded-xl border p-3">
        <Button variant="outline" size="sm" disabled={olderDayDisabled}
          onClick={() => setSelectedDay(dayShift(selectedDay, -1))}
          title={olderDayDisabled ? "No older data available" : undefined}>
          Older day
        </Button>
        <Input aria-label="Selected day" type="date" value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)} className="w-40" />
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
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      ) : summary && dashboard ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {([
              ["Tracked", formatDuration(summary.totalTrackedDuration)],
              ["Entries", summary.timeEntryCount],
              ["Active days", summary.activeDays],
              ["Projects", summary.projectCount],
              ["Notes", summary.noteCount],
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

      {/* Time logs + Notes */}
      {
        <div className="grid gap-4 lg:grid-cols-2">
          <LazyDetailList
            title="Time logs"
            rows={logs}
            loading={dayLoading}
            hasMore={!!logCursor}
            loadingMore={logLoadingMore}
            onMore={() => void moreTimeLogs()}
            render={(row) => (
              <>
                <p className="font-medium">{String(row.title || "Untitled work")}</p>
                <p className="text-xs text-muted-foreground">{formatDate(row.startAt)} · {formatDuration(row.durationSec)}</p>
              </>
            )}
          />
          <LazyDetailList
            title="Notes"
            rows={notes}
            loading={dayLoading}
            hasMore={!!noteCursor}
            loadingMore={noteLoadingMore}
            onMore={() => void moreNotes()}
            render={(row) => (
              <>
                <p className="font-medium">{String(row.title || "Untitled note")}</p>
                <p className="line-clamp-3 text-xs text-muted-foreground">{tiptapToPlainText(row.content).trim() || "No text"}</p>
                <p className="text-xs text-muted-foreground">{formatDate(row.updatedAt ?? row.createdAt)}</p>
              </>
            )}
          />
        </div>
      }
    </div>
  );
}

function FullRangeReport({
  days,
  rows,
  loading,
  hasMore,
  loadingMore,
  onMore,
  onClose,
}: {
  days: string[];
  rows: AdminRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onClose: () => void;
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
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-20 rounded-lg" /> : (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-2">
            {days.map((day) => {
              const dayRows = byDay.get(day) ?? [];
              return (
                <section key={day} className="space-y-2">
                  <h3 className="border-b pb-1 text-sm font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}</h3>
                  {dayRows.length ? dayRows.map((row, index) => (
                    <div key={String(row.id ?? `${day}-${index}`)} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{String(row.title ?? (row.table === "notes" ? "Untitled note" : "Untitled work"))}</p>
                      {row.table === "notes" ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{tiptapToPlainText(row.content).trim() || "No text"}</p> : <p className="mt-1 text-xs text-muted-foreground">{formatDuration(row.durationSec)}</p>}
                    </div>
                  )) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No content for this day.</p>}
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
        <ScrollArea className="h-80 rounded-lg">
          <div className="space-y-3 pr-2 pt-1">
            {loading ? (
              [1, 2, 3].map((item) => <Skeleton key={item} className="h-16 rounded-lg" />)
            ) : rows.length ? (
              rows.map((row, index) => (
                <div key={String(row.id ?? index)} className="rounded-lg border p-3 text-sm text-muted-foreground">
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
