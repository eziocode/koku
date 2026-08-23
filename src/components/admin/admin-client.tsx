"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Save, Shield, Trash2, UserPlus, UserRoundMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { formatDate, formatDuration, groupRowsByUser, plainTextToTiptap, tiptapToPlainText, type AdminRow, type AdminUser } from "@/lib/admin-data";

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
  const [canManageAdmins, setCanManageAdmins] = useState(false); const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [newAdminId, setNewAdminId] = useState(""); const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, AdminRow>>({});

  useEffect(() => { fetch("/api/auth/me").then(async (response) => { const body = await response.json() as { user?: { isAdmin?: boolean } | null }; setAccess(body.user?.isAdmin ? "allowed" : "denied"); }).catch(() => setAccess("denied")); }, []);
  async function load() {
    setLoading(true); const response = await fetch("/api/admin");
    if (response.status === 403) setAccess("denied");
    if (response.ok) { const body = await response.json() as { data: Record<string, AdminRow[]>; users?: AdminUser[]; admins?: AdminUser[]; canManageAdmins?: boolean }; setData(body.data); setUsers(body.users ?? []); setAdmins(body.admins ?? []); setCanManageAdmins(body.canManageAdmins === true); }
    setLoading(false);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (access === "allowed") void load(); }, [access]);

  const rows = useMemo(() => data[table] ?? [], [data, table]);
  const userGroups = useMemo(() => groupRowsByUser(Object.values(data).flat(), users), [data, users]);
  const selected = users.find((user) => user.id === selectedUser) ?? userGroups.find((group) => group.user.id === selectedUser)?.user;
  const visibleRows = useMemo(() => rows.filter((row) => String(row.userId) === selectedUser && (!search.trim() || JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))), [rows, selectedUser, search]);
  const userSearch = search.trim().toLowerCase();
  const visibleUsers = userGroups.filter(({ user }) => !userSearch || `${user.displayName} ${user.email}`.toLowerCase().includes(userSearch));
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
  async function changeAdmin(action: "add" | "remove", userId: string) { const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) }); if (response.ok) { toast.success(action === "add" ? "Admin added." : "Admin removed."); setNewAdminId(""); void load(); } else toast.error(await errorMessage(response, "Admin change failed.")); }

  if (access === "checking") return <p className="text-sm text-muted-foreground">Checking admin access…</p>;
  if (access === "denied") return <Card><CardHeader><CardTitle>Admin access required</CardTitle><CardDescription>This panel is available only to admin users.</CardDescription></CardHeader></Card>;
  return <div className="space-y-8">
    <div><p className="text-sm uppercase tracking-[0.3em] text-primary">Administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Workspace control center</h1><p className="mt-2 max-w-2xl text-muted-foreground">Inspect, edit, delete, and export workspace data.</p></div>
    {canManageAdmins ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Admin users</CardTitle><CardDescription>Only primary owner can manage delegated admins.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{admins.map((admin) => <Badge key={admin.id} variant="outline" className="gap-2">{admin.email}{admin.email.toLowerCase() !== "aswin.kg@zohocorp.com" ? <button type="button" aria-label={`Remove ${admin.email}`} onClick={() => void changeAdmin("remove", admin.id)}><UserRoundMinus className="h-3 w-3" /></button> : null}</Badge>)}</div><div className="flex max-w-xl gap-2"><select value={newAdminId} onChange={(event) => setNewAdminId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"><option value="">Select user to make admin</option>{availableAdmins.map((user) => <option key={user.id} value={user.id}>{user.email} — {user.displayName}</option>)}</select><Button disabled={!newAdminId} onClick={() => void changeAdmin("add", newAdminId)}><UserPlus className="mr-2 h-4 w-4" />Add</Button></div></CardContent></Card> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Data explorer</CardTitle><CardDescription>{selected ? `${selected.displayName || selected.email} · ${visibleRows.length} visible records` : `${userGroups.length} users · Select user to inspect records`}</CardDescription></CardHeader><CardContent className="space-y-4">
      {!selectedUser ? <><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users by name or email…" />{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : visibleUsers.length === 0 ? <p className="text-sm text-muted-foreground">No users found.</p> : <div className="grid gap-3 md:grid-cols-2">{visibleUsers.map(({ user, count }) => <button type="button" key={user.id} onClick={() => { setSelectedUser(user.id); setSearch(""); }} className="rounded-xl border p-4 text-left transition hover:border-primary hover:bg-muted/30"><p className="font-medium">{user.displayName || "Unnamed user"}</p><p className="text-sm text-muted-foreground">{user.email}</p><p className="mt-3 text-xs text-muted-foreground">{count} records across workspace</p></button>)}</div>}</> : <><div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => { setSelectedUser(null); setSearch(""); }}><ArrowLeft className="mr-2 h-4 w-4" />All users</Button><div className="flex gap-2"><Button variant="outline" onClick={() => download(`koku-${table}.csv`, csv(visibleRows), "text/csv")} disabled={!visibleRows.length}><Download className="mr-2 h-4 w-4" />CSV</Button><Button variant="outline" onClick={() => download(`koku-${table}.json`, visibleRows, "application/json")} disabled={!visibleRows.length}><Download className="mr-2 h-4 w-4" />JSON</Button></div></div><div className="flex flex-wrap gap-2">{TABLES.map((item) => <Button key={item} size="sm" variant={table === item ? "default" : "outline"} onClick={() => setTable(item)}>{labelForTable(item)}</Button>)}</div><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this user's records…" />{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : visibleRows.length === 0 ? <p className="text-sm text-muted-foreground">No matching records.</p> : visibleRows.map((row) => <RecordCard key={`${row.userId}:${table}:${rowKey(row)}`} table={table} row={row} draft={drafts[`${table}:${rowKey(row)}`]} setDraft={(draft) => setDrafts((current) => ({ ...current, [`${table}:${rowKey(row)}`]: draft }))} onSave={() => void save(row)} onDelete={() => void remove(row)} />)}</>}
    </CardContent></Card>
  </div>;
}

function RecordCard({ table, row, draft, setDraft, onSave, onDelete }: { table: Table; row: AdminRow; draft?: AdminRow; setDraft: (row: AdminRow) => void; onSave: () => void; onDelete: () => void }) {
  const value = draft ?? row; const set = (key: string, next: unknown) => setDraft({ ...value, [key]: next });
  const field = (key: string, label: string, type = "text") => <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{label}</span><Input type={type} value={String(value[key] ?? "")} onChange={(event) => set(key, event.target.value)} /></label>;
  return <div className="rounded-xl border p-4"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="font-medium">{String(value.title ?? value.name ?? (table === "noteLinks" ? `${value.sourceNoteId} → ${value.targetNoteId}` : "Untitled record"))}</p><p className="text-xs text-muted-foreground">ID: {rowKey(row)}</p></div><Button variant="ghost" size="icon" aria-label="Delete record" onClick={onDelete}><Trash2 className="text-destructive" /></Button></div>
    <div className="grid gap-3 md:grid-cols-2">{table === "notes" ? <>{field("title", "Title")}{field("slug", "Slug")}<label className="grid gap-1 text-sm md:col-span-2"><span className="text-muted-foreground">Content</span><Textarea value={tiptapToPlainText(value.content)} onChange={(event) => set("content", event.target.value)} className="min-h-28" /></label>{field("tags", "Tags (comma separated)")}</> : table === "timeEntries" ? <>{field("title", "Title")}{field("startAt", "Start")}{field("endAt", "End")}{field("durationSec", "Duration seconds", "number")}{field("projectId", "Project ID")}{field("categoryId", "Category ID")}{field("tags", "Tags (comma separated)")}</> : table === "projects" ? <>{field("name", "Name")}{field("color", "Color")}{field("hourlyRate", "Hourly rate", "number")}</> : table === "categories" ? <>{field("name", "Name")}{field("color", "Color")}</> : <>{field("sourceNoteId", "Source note ID")}{field("targetNoteId", "Target note ID")}</>}</div>
    <div className="mt-4 flex items-center justify-between"><div className="text-xs text-muted-foreground">{table === "timeEntries" ? `${formatDate(value.startAt)} · ${formatDuration(value.durationSec)}` : table === "notes" ? `Updated ${formatDate(value.updatedAt)}` : table === "projects" || table === "categories" ? `Created ${formatDate(value.createdAt)}` : "Linked notes"}</div>{draft ? <Button size="sm" onClick={onSave}><Save className="mr-2 h-4 w-4" />Save</Button> : <Button size="sm" variant="outline" onClick={() => setDraft({ ...row, content: tiptapToPlainText(row.content), tags: Array.isArray(row.tags) ? row.tags.join(", ") : row.tags })}>Edit</Button>}</div>
  </div>;
}

async function errorMessage(response: Response, fallback: string) { try { const body = await response.json() as { error?: string }; return body.error || fallback; } catch { return fallback; } }
