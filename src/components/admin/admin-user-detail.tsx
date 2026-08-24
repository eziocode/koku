"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatDate, formatDuration, getPresenceStatus, tiptapToPlainText, type AdminPresence, type AdminRow, type AdminStats, type AdminUser, type DashboardData } from "@/lib/admin-data";
import { syncNow } from "@/lib/sync/sync-engine";

type DetailResponse = { user: AdminUser; rows: AdminRow[]; nextCursor: string | null; summary: AdminStats; dashboard: DashboardData; presence?: AdminPresence };
type CacheValue = { rows: AdminRow[]; nextCursor: string | null };

function dayShift(day: string, amount: number) { const date = new Date(day + "T12:00:00"); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); }

export function AdminUserDetail({ userId }: { userId: string }) {
  const router = useRouter(); const today = new Date().toISOString().slice(0, 10);
  const [user, setUser] = useState<AdminUser | null>(null); const [summary, setSummary] = useState<AdminStats | null>(null); const [dashboard, setDashboard] = useState<DashboardData | null>(null); const [presence, setPresence] = useState<AdminPresence>();
  const [rangeDays, setRangeDays] = useState(30); const [end, setEnd] = useState(today); const [logs, setLogs] = useState<AdminRow[]>([]); const [notes, setNotes] = useState<AdminRow[]>([]); const [logCursor, setLogCursor] = useState<string | null>(null); const [noteCursor, setNoteCursor] = useState<string | null>(null); const [notesLoaded, setNotesLoaded] = useState(false); const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false);
  const cache = useRef(new Map<string, CacheValue>()); const requestVersion = useRef(0);
  const start = useMemo(() => { const date = new Date(end + "T12:00:00"); date.setDate(date.getDate() - rangeDays + 1); return date.toISOString().slice(0, 10); }, [end, rangeDays]);

  const fetchTable = useCallback(async (table: "timeEntries" | "notes", cursor?: string | null, force = false) => {
    const key = [userId, start, end, table, cursor ?? "0"].join("|"); if (!force && cache.current.has(key)) return cache.current.get(key)!;
    const query = "/api/admin?userId=" + encodeURIComponent(userId) + "&table=" + table + "&start=" + start + "&end=" + end + "&limit=25" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const response = await fetch(query, { cache: "no-store" }); if (!response.ok) throw new Error("Unable to load user detail");
    const value = await response.json() as DetailResponse; const result = { rows: value.rows, nextCursor: value.nextCursor }; cache.current.set(key, result);
    if (table === "timeEntries") { setUser(value.user); setSummary(value.summary); setDashboard(value.dashboard); setPresence(value.presence); }
    return result;
  }, [end, start, userId]);

  const load = useCallback(async (force = false) => {
    const version = ++requestVersion.current; setLoading(true);
    try { const logResult = await fetchTable("timeEntries", null, force); if (version !== requestVersion.current) return; setLogs(logResult.rows); setLogCursor(logResult.nextCursor); setNotes([]); setNoteCursor(null); setNotesLoaded(false); } catch (error) { if (version === requestVersion.current) toast.error(error instanceof Error ? error.message : "Unable to load user detail"); } finally { if (version === requestVersion.current) setLoading(false); }
  }, [fetchTable]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function sync() { setSyncing(true); try { await syncNow("local"); cache.current.clear(); await load(true); toast.success("Current data synced."); } catch { toast.error("Sync failed."); } finally { setSyncing(false); } }
  async function loadNotes() { try { const result = await fetchTable("notes", null); setNotes(result.rows); setNoteCursor(result.nextCursor); setNotesLoaded(true); } catch { toast.error("Unable to load notes"); } }
  async function more(table: "timeEntries" | "notes", cursor: string | null) { if (!cursor) return; const result = await fetchTable(table, cursor); if (table === "timeEntries") { setLogs((old) => [...old, ...result.rows]); setLogCursor(result.nextCursor); } else { setNotes((old) => [...old, ...result.rows]); setNoteCursor(result.nextCursor); } }

  const status = getPresenceStatus(presence); const statusLabel = status === "working" ? "Working" : status === "break" ? "On break" : status === "online" ? "Online" : "Offline";
  if (!user && loading) return <p className="text-sm text-muted-foreground">Loading user details…</p>;
  if (!user) return <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">User not found.</p><Button className="mt-4" onClick={() => router.push("/admin")}>Back to Admin</Button></CardContent></Card>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Button variant="ghost" onClick={() => router.push("/admin")}><ArrowLeft className="mr-2 h-4 w-4" />Back to Admin</Button><h1 className="mt-3 text-3xl font-semibold">{user.displayName || user.email}</h1><p className="text-sm text-muted-foreground">{user.email} · Last seen {formatDate(presence?.seenAt)}</p></div><div className="flex items-center gap-2"><Badge variant={status === "offline" ? "outline" : "default"}>{statusLabel}</Badge><Button variant="outline" onClick={() => void sync()} disabled={syncing}><RefreshCw className="mr-2 h-4 w-4" />{syncing ? "Syncing…" : "Manual Sync"}</Button></div></div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted-foreground">Range</span>{[7, 30, 90].map((value) => <Button key={value} size="sm" variant={rangeDays === value ? "default" : "outline"} onClick={() => setRangeDays(value)}>{value} days</Button>)}<Input aria-label="Range end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" /></div>
    <div className="flex items-center justify-between rounded-xl border p-3"><Button variant="outline" size="sm" onClick={() => setEnd(dayShift(end, -1))}>Older day</Button><span className="font-medium">{end}</span><Button variant="outline" size="sm" disabled={end >= today} onClick={() => setEnd(dayShift(end, 1))}>Newer day</Button></div>
    {summary && dashboard ? <><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[["Tracked", formatDuration(summary.totalTrackedDuration)], ["Entries", summary.timeEntryCount], ["Active days", summary.activeDays], ["Projects", summary.projectCount], ["Notes", summary.noteCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{String(value)}</p></div>)}</div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Daily work</CardTitle></CardHeader><CardContent className="space-y-2">{dashboard.daily.length ? dashboard.daily.map((item) => <div key={item.day} className="flex justify-between text-sm"><span>{item.day}</span><span>{formatDuration(item.seconds)}</span></div>) : <p className="text-sm text-muted-foreground">No work in range.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Project summary</CardTitle></CardHeader><CardContent className="space-y-2">{dashboard.projects.map((item) => <div key={item.id} className="flex justify-between text-sm"><span>{item.name}</span><span>{formatDuration(item.seconds)}</span></div>)}</CardContent></Card></div></> : null}
    <div className="grid gap-4 lg:grid-cols-2"><DetailList title="Time logs" rows={logs} nextCursor={logCursor} onMore={() => void more("timeEntries", logCursor)} render={(row) => <><p className="font-medium">{String(row.title || "Untitled work")}</p><p>{formatDate(row.startAt)} · {formatDuration(row.durationSec)}</p></>} />{notesLoaded ? <DetailList title="Notes" rows={notes} nextCursor={noteCursor} onMore={() => void more("notes", noteCursor)} render={(row) => <><p className="font-medium">{String(row.title || "Untitled note")}</p><p className="line-clamp-3">{tiptapToPlainText(row.content).trim() || "No text"}</p><p>{formatDate(row.updatedAt ?? row.createdAt)}</p></>} /> : <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><Button variant="outline" onClick={() => void loadNotes()}>Load notes</Button></CardContent></Card>}</div>
    {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
  </div>;
}

function DetailList({ title, rows, nextCursor, onMore, render }: { title: string; rows: AdminRow[]; nextCursor: string | null; onMore: () => void; render: (row: AdminRow) => React.ReactNode }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><div className="max-h-96 space-y-3 overflow-auto">{rows.length ? rows.map((row, index) => <div key={String(row.id ?? index)} className="rounded-lg border p-3 text-sm text-muted-foreground">{render(row)}</div>) : <p className="text-sm text-muted-foreground">No records.</p>}</div>{nextCursor ? <Button className="mt-3" variant="outline" onClick={onMore}>Load more</Button> : null}</CardContent></Card>; }
