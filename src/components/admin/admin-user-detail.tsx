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
type CacheValue = { rows: AdminRow[]; nextCursor: string | null };

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

async function localFirstActivity(): Promise<string | null> {
  const oldest = await kokuDb.timeEntries.orderBy("startAt").first();
  return oldest?.startAt ? oldest.startAt.slice(0, 10) : null;
}

export function AdminUserDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [summary, setSummary] = useState<AdminStats | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [presence, setPresence] = useState<AdminPresence>();

  const [rangeDays, setRangeDays] = useState(30);
  const [end, setEnd] = useState(today);

  const [logs, setLogs] = useState<AdminRow[]>([]);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [logLoadingMore, setLogLoadingMore] = useState(false);

  const [notes, setNotes] = useState<AdminRow[]>([]);
  const [noteCursor, setNoteCursor] = useState<string | null>(null);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [noteLoadingMore, setNoteLoadingMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [noDataConfirmed, setNoDataConfirmed] = useState(false);
  const [earliestDataDate, setEarliestDataDate] = useState<string | null>(null);

  const cache = useRef(new Map<string, CacheValue>());
  const requestVersion = useRef(0);

  const start = useMemo(() => {
    const date = new Date(end + "T12:00:00");
    date.setDate(date.getDate() - rangeDays + 1);
    return date.toISOString().slice(0, 10);
  }, [end, rangeDays]);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((b: { user?: { id?: string } | null }) => {
        setCurrentUserId(b.user?.id ?? null);
      })
      .catch(() => setCurrentUserId(null));
  }, []);

  const isOwnProfile = currentUserId !== null && currentUserId === userId;

  const fetchTable = useCallback(
    async (
      table: "timeEntries" | "notes",
      cursor?: string | null,
      force = false,
    ): Promise<CacheValue> => {
      const key = [userId, start, end, table, cursor ?? "0"].join("|");
      if (!force && cache.current.has(key)) return cache.current.get(key)!;

      const query =
        "/api/admin?userId=" +
        encodeURIComponent(userId) +
        "&table=" +
        table +
        "&start=" +
        start +
        "&end=" +
        end +
        "&limit=25" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");

      const response = await fetch(query, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load user detail");

      const value = (await response.json()) as DetailResponse;
      const result = { rows: value.rows, nextCursor: value.nextCursor };
      cache.current.set(key, result);

      if (table === "timeEntries") {
        setUser(value.user);
        setSummary(value.summary);
        setDashboard(value.dashboard);
        setPresence(value.presence);
        if (value.summary.firstActivity) {
          setEarliestDataDate(value.summary.firstActivity.slice(0, 10));
        }
      }

      return result;
    },
    [end, start, userId],
  );

  const load = useCallback(
    async (force = false) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setNoDataConfirmed(false);

      try {
        if (isOwnProfile && !force) {
          const [localLogs, localFirst] = await Promise.all([
            localEntriesForDay(end),
            localFirstActivity(),
          ]);

          if (version !== requestVersion.current) return;
          if (localFirst) setEarliestDataDate(localFirst);

          if (localLogs.length > 0) {
            setLogs(localLogs.slice(0, 25));
            setLogCursor(localLogs.length > 25 ? "25" : null);
            setNotes([]);
            setNoteCursor(null);
            setNotesLoaded(false);
            void fetchTable("timeEntries", null, false).catch(() => null);
            setLoading(false);
            return;
          }
        }

        const logResult = await fetchTable("timeEntries", null, force);
        if (version !== requestVersion.current) return;

        setLogs(logResult.rows);
        setLogCursor(logResult.nextCursor);
        setNotes([]);
        setNoteCursor(null);
        setNotesLoaded(false);

        if (logResult.rows.length === 0) {
          setNoDataConfirmed(true);
        }
      } catch (error) {
        if (version === requestVersion.current) {
          toast.error(
            error instanceof Error ? error.message : "Unable to load user detail",
          );
        }
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [end, fetchTable, isOwnProfile],
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

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

  async function loadNotes() {
    try {
      if (isOwnProfile) {
        const localNotes = await localNotesForDay(end);
        if (localNotes.length > 0) {
          setNotes(localNotes.slice(0, 25));
          setNoteCursor(localNotes.length > 25 ? "25" : null);
          setNotesLoaded(true);
          return;
        }
      }
      const result = await fetchTable("notes", null);
      setNotes(result.rows);
      setNoteCursor(result.nextCursor);
      setNotesLoaded(true);
    } catch {
      toast.error("Unable to load notes");
    }
  }

  async function moreTimeLogs() {
    if (!logCursor || logLoadingMore) return;
    if (isOwnProfile) {
      try {
        const allLocal = await localEntriesForDay(end);
        const offset = parseInt(logCursor, 10);
        const next = allLocal.slice(offset, offset + 25);
        setLogs((old) => [...old, ...next]);
        setLogCursor(allLocal.length > offset + 25 ? String(offset + 25) : null);
        return;
      } catch { /* fall through */ }
    }
    setLogLoadingMore(true);
    try {
      const result = await fetchTable("timeEntries", logCursor);
      setLogs((old) => [...old, ...result.rows]);
      setLogCursor(result.nextCursor);
    } catch { toast.error("Unable to load more logs."); }
    finally { setLogLoadingMore(false); }
  }

  async function moreNotes() {
    if (!noteCursor || noteLoadingMore) return;
    if (isOwnProfile) {
      try {
        const allLocal = await localNotesForDay(end);
        const offset = parseInt(noteCursor, 10);
        const next = allLocal.slice(offset, offset + 25);
        setNotes((old) => [...old, ...next]);
        setNoteCursor(allLocal.length > offset + 25 ? String(offset + 25) : null);
        return;
      } catch { /* fall through */ }
    }
    setNoteLoadingMore(true);
    try {
      const result = await fetchTable("notes", noteCursor);
      setNotes((old) => [...old, ...result.rows]);
      setNoteCursor(result.nextCursor);
    } catch { toast.error("Unable to load more notes."); }
    finally { setNoteLoadingMore(false); }
  }

  const olderDayDisabled = earliestDataDate ? end <= earliestDataDate : false;
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

      {/* Range controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Range</span>
        {[7, 30, 90].map((value) => (
          <Button key={value} size="sm" variant={rangeDays === value ? "default" : "outline"} onClick={() => setRangeDays(value)}>
            {value} days
          </Button>
        ))}
        <Input aria-label="Range end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
      </div>

      {/* Day navigator */}
      <div className="flex items-center justify-between rounded-xl border p-3">
        <Button variant="outline" size="sm" disabled={olderDayDisabled} onClick={() => setEnd(dayShift(end, -1))}
          title={olderDayDisabled ? "No older data available" : undefined}>
          Older day
        </Button>
        <span className="font-medium">{end}</span>
        <Button variant="outline" size="sm" disabled={end >= today} onClick={() => setEnd(dayShift(end, 1))}>
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
      {!loading && noDataConfirmed && logs.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No data found for <span className="font-semibold text-foreground">{end}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a different date or use Manual Sync if data was recently added.
          </p>
        </div>
      )}

      {/* Time logs + Notes */}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <LazyDetailList
            title="Time logs"
            rows={logs}
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
          {notesLoaded ? (
            <LazyDetailList
              title="Notes"
              rows={notes}
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
          ) : (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent><Button variant="outline" onClick={() => void loadNotes()}>Load notes</Button></CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function LazyDetailList({
  title,
  rows,
  hasMore,
  loadingMore,
  onMore,
  render,
}: {
  title: string;
  rows: AdminRow[];
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
            {rows.length ? (
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
