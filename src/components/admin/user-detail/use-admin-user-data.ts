"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import {
  dashboardForRange,
  type AdminPresence,
  type AdminRow,
  type AdminStats,
  type AdminUser,
  type AdminWorkSchedule,
  type DashboardData,
} from "@/lib/admin-data";
import { kokuDb } from "@/lib/storage/db";
import { syncNow } from "@/lib/sync/sync-engine";

import {
  localEntriesForDay,
  localFirstActivity,
  localNotesForDay,
  localReportRows,
  localTasksForRange,
} from "./local-data";
import {
  AUX_TABLES,
  EMPTY_AUX_ROWS,
  dayShift,
  daysBetween,
  localToday,
  type AuxRows,
  type AuxTable,
  type CacheValue,
  type DetailResponse,
  type PagedTable,
  type ReportResponse,
} from "./types";

const PAGE_SIZE = 25;

/** Ceiling on how many rows an unpaged auxiliary table contributes. */
const AUX_ROW_CAP = 500;

/**
 * Every piece of state the user detail page renders, and the loaders that fill
 * it. Extracted from the page component so the five tabs can stay presentational.
 *
 * Two data paths run behind one interface. On an admin's own profile the Dexie
 * mirror is read directly, because it is already on the device and is fresher
 * than the cloud between syncs. For anyone else, and whenever `force` is set by
 * Manual Sync, the same shapes come from `/api/admin`.
 */
export function useAdminUserData(userId: string) {
  const today = localToday();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [summary, setSummary] = useState<AdminStats | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  /** Same shape as `dashboard`, but spanning the whole From/To range — feeds the charts. */
  const [rangeDashboard, setRangeDashboard] = useState<DashboardData | null>(null);
  const [presence, setPresence] = useState<AdminPresence>();
  const [workSchedule, setWorkSchedule] = useState<AdminWorkSchedule>();

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

  const [auxRows, setAuxRows] = useState<AuxRows>(EMPTY_AUX_ROWS);
  const [auxLoading, setAuxLoading] = useState(true);

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
      table: PagedTable,
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
        `&limit=${PAGE_SIZE}` +
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
        setWorkSchedule(value.workSchedule);
        setEarliestDataDate(value.summary.firstActivity
          ? value.summary.firstActivity.slice(0, 10)
          : null);
      }

      return result;
    },
    [rangeEnd, setDashboard, setEarliestDataDate, setPresence, setSummary, setUser, setWorkSchedule, start, userId],
  );

  /**
   * Reads one small table whole, following the cursor.
   *
   * These always come from the API, including on an admin's own profile: the
   * broadcast `notifications` table has no local mirror at all, and reading the
   * rest the same way keeps one code path. The cap stops a pathological account
   * from pulling thousands of rows into a card nobody scrolls that far down.
   */
  const fetchAllRows = useCallback(async (table: AuxTable): Promise<AdminRow[]> => {
    const rows: AdminRow[] = [];
    let cursor: string | null = null;

    do {
      const query: string =
        "/api/admin?userId=" +
        encodeURIComponent(userId) +
        "&table=" +
        table +
        "&limit=100" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      const response: Response = await fetch(query, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load ${table}`);
      const value = (await response.json()) as DetailResponse;
      rows.push(...value.rows.map((row) => ({ ...row, table })));
      cursor = value.nextCursor;
    } while (cursor && rows.length < AUX_ROW_CAP);

    return rows;
  }, [userId]);

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
    const [rows, projects, categories] = await Promise.all([
      localReportRows(start, rangeEnd),
      kokuDb.projects.toArray(),
      kokuDb.categories.toArray(),
    ]);
    return dashboardForRange(
      [
        ...rows,
        ...projects.map((project) => ({ ...project, table: "projects" } as AdminRow)),
        ...categories.map((category) => ({ ...category, table: "categories" } as AdminRow)),
      ],
      `${start}T00:00:00`,
      `${rangeEnd}T23:59:59.999`,
    );
  }, [rangeEnd, start]);

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

      // The auxiliary tables never change with the day or range, so they load
      // alongside the main request rather than blocking it.
      setAuxLoading(true);
      void Promise.all(AUX_TABLES.map((table) => fetchAllRows(table).catch(() => [] as AdminRow[])))
        .then((results) => {
          if (version !== requestVersion.current) return;
          const next = { ...EMPTY_AUX_ROWS };
          AUX_TABLES.forEach((table, index) => { next[table] = results[index]; });
          setAuxRows(next);
        })
        .finally(() => {
          if (version === requestVersion.current) setAuxLoading(false);
        });

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
          setLogs(localLogs.slice(0, PAGE_SIZE));
          setLogCursor(localLogs.length > PAGE_SIZE ? String(PAGE_SIZE) : null);
          setNotes(localNotes.slice(0, PAGE_SIZE));
          setNoteCursor(localNotes.length > PAGE_SIZE ? String(PAGE_SIZE) : null);
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
          setTasks(localTasks.slice(0, PAGE_SIZE));
          setTaskCursor(localTasks.length > PAGE_SIZE ? String(PAGE_SIZE) : null);
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
    [fetchAllRows, fetchTable, isOwnProfile, localDashboardForRange, localDashboardForSelectedDay, rangeEnd, selectedDay, setAuxLoading, setAuxRows, setDashboard, setDayLoading, setEarliestDataDate, setLoading, setLogCursor, setLogs, setNoDataConfirmed, setNoteCursor, setNotes, setRangeDashboard, setTaskCursor, setTasks, start],
  );

  useEffect(() => {
    if (authChecked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
  }, [authChecked, load]);

  const sync = useCallback(async () => {
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
  }, [load]);

  const moreTimeLogs = useCallback(async () => {
    if (!logCursor || logLoadingMore) return;
    if (isOwnProfile) {
      setLogLoadingMore(true);
      try {
        const allLocal = await localEntriesForDay(selectedDay);
        const offset = parseInt(logCursor, 10);
        const next = allLocal.slice(offset, offset + PAGE_SIZE);
        setLogs((old) => [...old, ...next]);
        setLogCursor(allLocal.length > offset + PAGE_SIZE ? String(offset + PAGE_SIZE) : null);
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
  }, [fetchTable, isOwnProfile, logCursor, logLoadingMore, selectedDay]);

  const moreNotes = useCallback(async () => {
    if (!noteCursor || noteLoadingMore) return;
    if (isOwnProfile) {
      setNoteLoadingMore(true);
      try {
        const allLocal = await localNotesForDay(selectedDay);
        const offset = parseInt(noteCursor, 10);
        const next = allLocal.slice(offset, offset + PAGE_SIZE);
        setNotes((old) => [...old, ...next]);
        setNoteCursor(allLocal.length > offset + PAGE_SIZE ? String(offset + PAGE_SIZE) : null);
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
  }, [fetchTable, isOwnProfile, noteCursor, noteLoadingMore, selectedDay]);

  const moreTasks = useCallback(async () => {
    if (!taskCursor || taskLoadingMore) return;
    if (isOwnProfile) {
      setTaskLoadingMore(true);
      try {
        const allLocal = await localTasksForRange(start, rangeEnd);
        const offset = parseInt(taskCursor, 10);
        const next = allLocal.slice(offset, offset + PAGE_SIZE);
        setTasks((old) => [...old, ...next]);
        setTaskCursor(allLocal.length > offset + PAGE_SIZE ? String(offset + PAGE_SIZE) : null);
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
  }, [fetchTable, isOwnProfile, rangeEnd, start, taskCursor, taskLoadingMore]);

  return {
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
  };
}

export type AdminUserData = ReturnType<typeof useAdminUserData>;
