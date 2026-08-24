"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Download, Pencil, Save, Shield, Trash2, UserPlus, UserRoundMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { dashboardForRange, formatDate, formatDuration, getPresenceStatus, groupRowsByUser, plainTextToTiptap, tiptapToPlainText, type AdminGroup, type AdminPresence, type AdminRow, type AdminStats, type AdminUser } from "@/lib/admin-data";

const TABLES = ["timeEntries", "projects", "categories", "notes", "noteLinks"] as const;
type Table = (typeof TABLES)[number];

function labelForTable(table: Table) { return table === "timeEntries" ? "Time logs" : table === "noteLinks" ? "Note links" : table[0].toUpperCase() + table.slice(1); }
function rowKey(row: AdminRow) { return String(row.id ?? row.key ?? ""); }
function download(filename: string, value: unknown, type: string) {
  const blob = new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
function csv(rows: AdminRow[]) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [columns, ...rows.map((row) => columns.map((column) => { const value = row[column]; const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? ""); return `"${text.replaceAll('"', '""')}"`; }))].map((line) => line.join(",")).join("\n");
}

export function AdminClient() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [table, setTable] = useState<Table>("timeEntries");
  const [data, setData] = useState<Record<string, AdminRow[]>>({});
  const [users, setUsers] = useState<AdminUser[]>([]); const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false); const [ownerUserId, setOwnerUserId] = useState(""); const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, AdminStats>>({});
  const [presence, setPresence] = useState<Record<string, AdminPresence>>({}); const [mode, setMode] = useState<"analytics" | "edit">("analytics");
  const [search, setSearch] = useState(""); const [newAdminId, setNewAdminId] = useState(""); const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, AdminRow>>({});

  useEffect(() => { fetch("/api/auth/me").then(async (response) => { const body = await response.json() as { user?: { isAdmin?: boolean } | null }; setAccess(body.user?.isAdmin ? "allowed" : "denied"); }).catch(() => setAccess("denied")); }, []);
  async function load() {
    setLoading(true); const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.status === 403) setAccess("denied");
    if (response.ok) { const body = await response.json() as { data: Record<string, AdminRow[]>; users?: AdminUser[]; admins?: AdminUser[]; groups?: AdminGroup[]; stats?: Record<string, AdminStats>; presence?: Record<string, AdminPresence>; ownerUserId?: string; canManageAdmins?: boolean }; setData(body.data); setUsers(body.users ?? []); setAdmins(body.admins ?? []); setGroups(body.groups ?? []); setStats(body.stats ?? {}); setPresence(body.presence ?? {}); setOwnerUserId(body.ownerUserId ?? ""); setCanManageAdmins(body.canManageAdmins === true); }
    setLoading(false);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (access === "allowed") void load(); }, [access]);

  const rows = useMemo(() => data[table] ?? [], [data, table]);
  const userGroups = useMemo(() => groupRowsByUser(Object.values(data).flat(), users).map((group) => ({
    ...group,
    user: { ...group.user, displayName: `${group.user.displayName || "Unnamed user"} (${group.user.id})` },
  })), [data, users]);
  const selected = userGroups.find((group) => group.user.id === selectedUser)?.user ?? users.find((user) => user.id === selectedUser) ?? { id: "", email: "", displayName: "" };
  const visibleRows = useMemo(() => rows.filter((row) => String(row.userId) === selectedUser && (!search.trim() || JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))), [rows, selectedUser, search]);
  const userSearch = search.trim().toLowerCase();
  const visibleUsers = userGroups.filter(({ user }) => !userSearch || `${user.displayName} ${user.email} ${user.id}`.toLowerCase().includes(userSearch));
  const availableAdmins = users.filter((user) => !admins.some((admin) => admin.id === user.id));

  async function save(row: AdminRow) {
    const draft = drafts[`${table}:${rowKey(row)}`]; if (!draft) return;
    const response = await fetch("/api/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, userId: row.userId, row: { ...draft, content: typeof draft.content === "string" ? plainTextToTiptap(draft.content) : draft.content, tags: typeof draft.tags === "string" ? draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : draft.tags } }) });
    if (response.ok) { toast.success("Record updated."); void load(); } else toast.error(await errorMessage(response, "Update failed."));
  }
  async function remove(row: AdminRow) {
    if (!window.confirm("Delete this record permanently?")) return;
    const response = await fetch(`/api/admin?table=${table}&userId=${encodeURIComponent(String(row.userId))}&id=${encodeURIComponent(rowKey(row))}`, { method: "DELETE" });
    if (!response.ok) { toast.error(await errorMessage(response, "Delete failed.")); return; }
    const body = await response.json() as { found?: boolean };
    if (!body.found) { toast.error("Record not found."); return; }
    setData((current) => ({ ...current, [table]: (current[table] ?? []).filter((item) => rowKey(item) !== rowKey(row) || String(item.userId) !== String(row.userId)) }));
    setDrafts((current) => { const next = { ...current }; delete next[`${table}:${rowKey(row)}`]; return next; }); toast.success("Record deleted.");
  }
  async function changeAdmin(action: "add" | "remove", userId: string) { const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) }); if (response.ok) { toast.success(action === "add" ? "Admin added." : "Admin removed."); if (action === "remove") setAdmins((current) => current.filter((admin) => admin.id !== userId)); setNewAdminId(""); await load(); } else toast.error(await errorMessage(response, "Admin change failed.")); }

  if (access === "checking") return <p className="text-sm text-muted-foreground">Checking admin access…</p>;
  if (access === "denied") return <Card><CardHeader><CardTitle>Admin access required</CardTitle><CardDescription>This panel is available only to admin users.</CardDescription></CardHeader></Card>;
  return <div className="space-y-8">
    <div><p className="text-sm uppercase tracking-[0.3em] text-primary">Administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Workspace control center</h1><p className="mt-2 max-w-2xl text-muted-foreground">Inspect, edit, delete, and export workspace data.</p></div>
    {canManageAdmins ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Admin users</CardTitle><CardDescription>Only primary owner can manage delegated admins.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{admins.map((admin) => <Badge key={admin.id} variant="outline" className="gap-2">{admin.email}{admin.id !== ownerUserId ? <button type="button" aria-label={`Remove ${admin.email}`} onClick={() => void changeAdmin("remove", admin.id)}><UserRoundMinus className="h-3 w-3" /></button> : null}</Badge>)}</div><div className="flex max-w-xl gap-2"><select value={newAdminId} onChange={(event) => setNewAdminId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"><option value="">Select user to make admin</option>{availableAdmins.map((user) => <option key={user.id} value={user.id}>{user.email} — {user.displayName}</option>)}</select><Button disabled={!newAdminId} onClick={() => void changeAdmin("add", newAdminId)}><UserPlus className="mr-2 h-4 w-4" />Add</Button></div></CardContent></Card> : null}
    {canManageAdmins ? <AdminGroups groups={groups} users={users} onChanged={load} /> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Data explorer</CardTitle><CardDescription>{selectedUser && mode === "analytics" ? "User analytics dashboard" : selected ? `${selected.displayName || selected.email} · ${visibleRows.length} visible records` : `${userGroups.length} users · Select user to inspect records`}</CardDescription></CardHeader><CardContent className="space-y-4">
      {!selectedUser ? <><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users by name or email…" />{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : visibleUsers.length === 0 ? <p className="text-sm text-muted-foreground">No users found.</p> : <div className="grid gap-3 md:grid-cols-2">{visibleUsers.map(({ user, count }) => <button type="button" key={user.id} onClick={() => { setSelectedUser(user.id); setSearch(""); setMode("analytics"); }} className="rounded-xl border p-4 text-left transition hover:border-primary hover:bg-muted/30"><p className="font-medium">{user.displayName || "Unnamed user"}</p><p className="text-sm text-muted-foreground">{user.email}</p><p className="mt-3 text-xs text-muted-foreground">{count} records across workspace</p></button>)}</div>}</> : mode === "analytics" ? <UserDashboard user={selected!} rows={Object.entries(data).flatMap(([item, entries]) => entries.filter((row) => String(row.userId) === selectedUser).map((row) => ({ ...row, table: item })))} presence={presence[selected.id]} onBack={() => { setSelectedUser(null); setSearch(""); }} onEdit={() => setMode("edit")} /> : <><div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => { setSelectedUser(null); setSearch(""); }}><ArrowLeft className="mr-2 h-4 w-4" />All users</Button><div className="flex gap-2"><Button variant="outline" onClick={() => download(`koku-${table}.csv`, csv(visibleRows), "text/csv")} disabled={!visibleRows.length}><Download className="mr-2 h-4 w-4" />CSV</Button><Button variant="outline" onClick={() => download(`koku-${table}.json`, visibleRows, "application/json")} disabled={!visibleRows.length}><Download className="mr-2 h-4 w-4" />JSON</Button><Button onClick={() => setMode("analytics")}>Analytics</Button></div></div><div className="flex flex-wrap gap-2">{TABLES.map((item) => <Button key={item} size="sm" variant={table === item ? "default" : "outline"} onClick={() => setTable(item)}>{labelForTable(item)}</Button>)}</div><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this user's records…" />{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : visibleRows.length === 0 ? <p className="text-sm text-muted-foreground">No matching records.</p> : visibleRows.map((row) => <RecordCard key={`${row.userId}:${table}:${rowKey(row)}`} table={table} row={row} draft={drafts[`${table}:${rowKey(row)}`]} setDraft={(draft) => setDrafts((current) => ({ ...current, [`${table}:${rowKey(row)}`]: draft }))} onSave={() => void save(row)} onDelete={() => void remove(row)} />)}</>}
    </CardContent></Card>
  </div>;
}

function AdminGroups({ groups, users, onChanged }: { groups: AdminGroup[]; users: AdminUser[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Record<string, string[]>>(() => Object.fromEntries(groups.map((group) => [group.id, group.userIds])));

  useEffect(() => {
    setMembers(Object.fromEntries(groups.map((group) => [group.id, group.userIds])));
  }, [groups]);

  async function createGroup() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createGroup", group: { name: trimmed } }) });
    if (!response.ok) { toast.error(await errorMessage(response, "Group creation failed.")); return; }
    setName(""); toast.success("Group created."); await onChanged();
  }

  async function saveGroup(group: AdminGroup) {
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateGroup", group: { ...group, userIds: members[group.id] ?? [] } }) });
    if (response.ok) { toast.success("Group members saved."); await onChanged(); } else toast.error(await errorMessage(response, "Group update failed."));
  }

  async function deleteGroup(group: AdminGroup) {
    if (!window.confirm(`Delete group “${group.name}”? Users stay unchanged.`)) return;
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteGroup", group: { id: group.id } }) });
    if (response.ok) { toast.success("Group deleted."); await onChanged(); } else toast.error(await errorMessage(response, "Group deletion failed."));
  }

  return <Card><CardHeader><CardTitle>Groups</CardTitle><CardDescription>Organize users into reusable groups. Grouping does not change permissions.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex max-w-xl gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New group name" onKeyDown={(event) => { if (event.key === "Enter") void createGroup(); }} /><Button disabled={!name.trim()} onClick={() => void createGroup()}>Create group</Button></div>{groups.length ? <div className="grid gap-4 md:grid-cols-2">{groups.map((group) => <div key={group.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><div><p className="font-medium">{group.name}</p><p className="text-xs text-muted-foreground">{(members[group.id] ?? []).length} members</p></div><div className="flex gap-2"><Button size="sm" onClick={() => void saveGroup(group)}>Save</Button><Button size="sm" variant="ghost" onClick={() => void deleteGroup(group)}>Delete</Button></div></div><div className="mt-3 max-h-56 space-y-2 overflow-auto">{users.map((user) => { const selected = (members[group.id] ?? []).includes(user.id); return <label key={user.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selected} onChange={() => setMembers((current) => ({ ...current, [group.id]: selected ? (current[group.id] ?? []).filter((id) => id !== user.id) : [...(current[group.id] ?? []), user.id] }))} /><span>{user.displayName || "Unnamed user"}<span className="ml-1 text-xs text-muted-foreground">({user.id})</span><span className="block text-xs text-muted-foreground">{user.email}</span></span></label>; })}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No groups yet.</p>}</CardContent></Card>;
}

function UserDashboard({ user, rows, presence, onBack, onEdit }: { user: AdminUser; rows: AdminRow[]; presence?: AdminPresence; onBack: () => void; onEdit: () => void }) {
  const [days, setDays] = useState(30); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const now = new Date(); const defaultEnd = now.toISOString().slice(0, 10); const defaultStart = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const from = start || defaultStart; const to = end || defaultEnd;
  const dashboard = useMemo(() => dashboardForRange(rows, `${from}T00:00:00`, `${to}T23:59:59.999`), [rows, from, to]);
  const status = getPresenceStatus(presence); const label = status === "working" ? "Working" : status === "break" ? "On break" : status === "online" ? "Online" : "Offline";
  const max = Math.max(...dashboard.daily.map((item) => item.seconds), 1);
  return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />All users</Button><h2 className="mt-3 text-2xl font-semibold">{user.displayName || user.email}</h2><p className="text-sm text-muted-foreground">{user.email} · Times shown in your local timezone.</p></div><div className="flex gap-2"><Badge variant={status === "offline" ? "outline" : "default"}>{label}</Badge><Button variant="outline" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit data</Button></div></div>
    <div className="rounded-xl border bg-muted/20 p-4 text-sm">{status === "working" && presence?.work ? <>Timer: <span className="font-medium break-all">{presence.work.title}</span> · started {formatDate(presence.work.startedAt)}</> : status === "break" && presence?.break ? <>Break: <span className="font-medium break-all">{presence.break.label}</span> · started {formatDate(presence.break.startedAt)}</> : <>Last saved activity: {formatDate(dashboard.lastActivity)}</>}<span className="ml-2 text-muted-foreground">Heartbeat: {formatDate(presence?.seenAt)}</span></div>
    <div className="flex flex-wrap gap-2">{[7, 30, 90].map((value) => <Button key={value} size="sm" variant={!start && !end && days === value ? "default" : "outline"} onClick={() => { setDays(value); setStart(""); setEnd(""); }}>{value} days</Button>)}<Input aria-label="Start date" type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-40" /><Input aria-label="End date" type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-40" /></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[["Today", formatDuration(dashboard.todaySeconds)], ["Range total", formatDuration(dashboard.totalSeconds)], ["Active days", dashboard.activeDays], ["Entries", dashboard.workEntries.length], ["Notes", dashboard.notes.length]].map(([name, value]) => <div key={String(name)} className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{name}</p><p className="mt-1 text-lg font-semibold">{String(value)}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border p-4"><h3 className="font-medium">Daily work</h3><p className="text-xs text-muted-foreground">Breaks excluded</p><div className="mt-4 space-y-2">{dashboard.daily.length ? dashboard.daily.map((item) => <div key={item.day} className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-2 text-xs"><span>{item.day}</span><div className="h-3 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${item.seconds / max * 100}%` }} /></div><span className="text-right">{formatDuration(item.seconds)}</span></div>) : <p className="py-8 text-sm text-muted-foreground">No work in range.</p>}</div></div><div className="rounded-xl border p-4"><h3 className="font-medium">Project allocation</h3><p className="text-xs text-muted-foreground">Work only</p><div className="mt-4 space-y-3">{dashboard.projects.length ? dashboard.projects.map((item) => <div key={item.id}><div className="flex justify-between gap-3 text-sm"><span className="truncate">{item.name}</span><span>{formatDuration(item.seconds)}</span></div><div className="mt-1 h-2 rounded" style={{ width: `${item.seconds / Math.max(dashboard.totalSeconds, 1) * 100}%`, backgroundColor: item.color }} /></div>) : <p className="py-8 text-sm text-muted-foreground">No project work in range.</p>}</div></div></div>
    <div className="grid gap-4 lg:grid-cols-2"><Timeline title="Time logs" empty="No work logs in range." rows={dashboard.workEntries} render={(row) => <><p className="font-medium break-all">{String(row.title || "Untitled work")}</p><p>{formatDate(row.startAt)} · {formatDuration(row.durationSec)}</p></>} /><Timeline title={`Notes (${dashboard.notes.length})`} empty="No notes in range." rows={dashboard.notes} render={(row) => <><p className="font-medium break-all">{String(row.title || "Untitled note")}</p><p className="line-clamp-2 break-words">{tiptapToPlainText(row.content).trim() || "No text"}</p><p>{formatDate(row.updatedAt ?? row.createdAt)}</p></>} /></div>
    {dashboard.breakEntries.length ? <Timeline title={`Breaks (${dashboard.breakEntries.length}) — excluded from totals`} empty="" rows={dashboard.breakEntries} render={(row) => <><p className="font-medium break-all">{String(row.title || "Break")}</p><p>{formatDate(row.startAt)} · {formatDuration(row.durationSec)}</p></>} /> : null}</div>;
}

function Timeline({ title, empty, rows, render }: { title: string; empty: string; rows: AdminRow[]; render: (row: AdminRow) => ReactNode }) { return <div className="rounded-xl border p-4"><h3 className="font-medium">{title}</h3><div className="mt-3 max-h-96 space-y-3 overflow-auto">{rows.length ? [...rows].sort((a, b) => String(b.updatedAt ?? b.startAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.startAt ?? a.createdAt ?? ""))).map((row) => <div key={rowKey(row)} className="rounded-lg border p-3 text-sm text-muted-foreground">{render(row)}</div>) : <p className="py-6 text-sm text-muted-foreground">{empty}</p>}</div></div>; }

function RecordCard({ table, row, draft, setDraft, onSave, onDelete }: { table: Table; row: AdminRow; draft?: AdminRow; setDraft: (row: AdminRow) => void; onSave: () => void; onDelete: () => void }) {
  const value = draft ?? row; const set = (key: string, next: unknown) => setDraft({ ...value, [key]: next });
  const editing = Boolean(draft);
  const field = (key: string, label: string, type = "text") => <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{label}</span><Input type={type} readOnly={!editing} value={String(value[key] ?? "")} onChange={(event) => set(key, event.target.value)} /></label>;
  return <div className="rounded-xl border p-4"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="font-medium">{String(value.title ?? value.name ?? (table === "noteLinks" ? `${value.sourceNoteId} → ${value.targetNoteId}` : "Untitled record"))}</p><p className="text-xs text-muted-foreground">ID: {rowKey(row)}</p></div><Button variant="ghost" size="icon" aria-label="Delete record" onClick={onDelete}><Trash2 className="text-destructive" /></Button></div>
    <div className="grid gap-3 md:grid-cols-2">{table === "notes" ? <>{field("title", "Title")}{field("slug", "Slug")}<label className="grid gap-1 text-sm md:col-span-2"><span className="text-muted-foreground">Content</span><Textarea readOnly={!editing} value={tiptapToPlainText(value.content)} onChange={(event) => set("content", event.target.value)} className="min-h-28" /></label>{field("tags", "Tags (comma separated)")}</> : table === "timeEntries" ? <>{field("title", "Title")}{field("startAt", "Start")}{field("endAt", "End")}{field("durationSec", "Duration seconds", "number")}{field("projectId", "Project ID")}{field("categoryId", "Category ID")}{field("tags", "Tags (comma separated)")}</> : table === "projects" ? <>{field("name", "Name")}{field("color", "Color")}{field("hourlyRate", "Hourly rate", "number")}</> : table === "categories" ? <>{field("name", "Name")}{field("color", "Color")}</> : <>{field("sourceNoteId", "Source note ID")}{field("targetNoteId", "Target note ID")}</>}</div>
    <div className="mt-4 flex items-center justify-between"><div className="text-xs text-muted-foreground">{table === "timeEntries" ? `${formatDate(value.startAt)} · ${formatDuration(value.durationSec)}` : table === "notes" ? `Updated ${formatDate(value.updatedAt)}` : table === "projects" || table === "categories" ? `Created ${formatDate(value.createdAt)}` : "Linked notes"}</div>{draft ? <Button size="sm" onClick={onSave}><Save className="mr-2 h-4 w-4" />Save</Button> : <Button size="sm" variant="outline" onClick={() => setDraft({ ...row, content: tiptapToPlainText(row.content), tags: Array.isArray(row.tags) ? row.tags.join(", ") : row.tags })}>Edit</Button>}</div>
  </div>;
}

function StatsHeader({ stats }: { stats: AdminStats }) {
  return <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">{[["Tracked", formatDuration(stats.totalTrackedDuration)], ["Entries", stats.timeEntryCount], ["Active days", stats.activeDays], ["Projects", stats.projectCount], ["Categories", stats.categoryCount], ["Notes", stats.noteCount], ["First", formatDate(stats.firstActivity)], ["Latest", formatDate(stats.latestActivity)]].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-muted/30 p-2"><span className="text-muted-foreground">{label}</span><div className="font-medium">{String(value)}</div></div>)}</div>;
}

async function errorMessage(response: Response, fallback: string) { try { const body = await response.json() as { error?: string }; return body.error || fallback; } catch { return fallback; } }
