"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Shield, Trash2, UserPlus, UserRoundMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const TABLES = ["timeEntries", "projects", "categories", "notes", "noteLinks"] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;
type User = { id: string; email: string; displayName: string };

function labelForTable(table: Table) {
  return table === "timeEntries" ? "Time logs" : table === "noteLinks" ? "Note links" : table;
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, rows: Row[]) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csv = [columns, ...rows.map((row) => columns.map((column) => {
    const value = row[column];
    const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }))].map((line) => line.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminClient() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [table, setTable] = useState<Table>("timeEntries");
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [selectedUser, setSelectedUser] = useState("all");
  const [search, setSearch] = useState("");
  const [newAdminId, setNewAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        const body = (await response.json()) as { user?: { isAdmin?: boolean } | null };
        setAccess(body.user?.isAdmin === true ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  async function load(nextTable = table) {
    setLoading(true);
    const res = await fetch(`/api/admin?table=${nextTable}`);
    if (res.status === 403) {
      setAccess("denied");
    } else if (res.ok) {
      const body = (await res.json()) as {
        data: Record<string, Row[]>;
        users?: User[];
        admins?: User[];
        canManageAdmins?: boolean;
      };
      setRows(body.data[nextTable] ?? []);
      setUsers(body.users ?? []);
      setAdmins(body.admins ?? []);
      setCanManageAdmins(body.canManageAdmins === true);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (access === "allowed") void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [access, table]); // eslint-disable-line react-hooks/exhaustive-deps

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesUser = selectedUser === "all" || String(row.userId) === selectedUser;
      const matchesSearch = !query || JSON.stringify(row).toLowerCase().includes(query);
      return matchesUser && matchesSearch;
    });
  }, [rows, search, selectedUser]);
  const userCount = new Set(rows.map((row) => String(row.userId ?? "unknown"))).size;
  const availableAdmins = users.filter((user) => !admins.some((admin) => admin.id === user.id));

  async function save(row: Row) {
    const key = String(row.id ?? row.key);
    let edited: Row;
    try { edited = JSON.parse(drafts[key] ?? JSON.stringify(row)) as Row; } catch { toast.error("Invalid JSON."); return; }
    const res = await fetch("/api/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, userId: row.userId, row: edited }) });
    if (res.ok) { toast.success("Row updated."); void load(); } else toast.error("Update failed.");
  }

  async function remove(row: Row) {
    const key = String(row.id ?? row.key);
    const res = await fetch(`/api/admin?table=${table}&userId=${encodeURIComponent(String(row.userId))}&id=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (res.ok) { toast.success("Row deleted."); void load(); } else toast.error("Delete failed.");
  }

  async function changeAdmin(action: "add" | "remove", userId: string) {
    const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) });
    if (res.ok) { toast.success(action === "add" ? "Admin added." : "Admin removed."); setNewAdminId(""); void load(); }
    else toast.error("Admin change failed.");
  }

  if (access === "checking") return <p className="text-sm text-muted-foreground">Checking admin access…</p>;
  if (access === "denied") return <Card><CardHeader><CardTitle>Admin access required</CardTitle><CardDescription>This panel is available only to admin users.</CardDescription></CardHeader></Card>;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Workspace control center</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Inspect, filter, edit, delete, and export logs, notes, and synced workspace data.</p>
      </div>

      {canManageAdmins ? <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Admin users</CardTitle><CardDescription>Only primary owner can add or remove delegated admins.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">{admins.map((admin) => <Badge key={admin.id} variant="outline" className="gap-2">{admin.email}{admin.email.toLowerCase() !== "aswin.kg@zohocorp.com" ? <button type="button" aria-label={`Remove ${admin.email}`} onClick={() => void changeAdmin("remove", admin.id)}><UserRoundMinus className="h-3 w-3" /></button> : null}</Badge>)}</div>
          <div className="flex max-w-xl gap-2"><select value={newAdminId} onChange={(event) => setNewAdminId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"><option value="">Select user to make admin</option>{availableAdmins.map((user) => <option key={user.id} value={user.id}>{user.email} — {user.displayName}</option>)}</select><Button disabled={!newAdminId} onClick={() => void changeAdmin("add", newAdminId)}><UserPlus className="mr-2 h-4 w-4" />Add</Button></div>
        </CardContent>
      </Card> : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Data explorer</CardTitle><CardDescription>{filteredRows.length} visible records · {userCount} users in {labelForTable(table)}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">{TABLES.map((item) => <Button key={item} size="sm" variant={table === item ? "default" : "outline"} onClick={() => { setTable(item); setDrafts({}); }}>{labelForTable(item)}</Button>)}</div>
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto]">
            <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All users</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" />
            <Button variant="outline" onClick={() => downloadCsv(`koku-${table}.csv`, filteredRows)} disabled={!filteredRows.length}><Download className="mr-2 h-4 w-4" />CSV</Button>
            <Button variant="outline" onClick={() => downloadJson(`koku-${table}.json`, filteredRows)} disabled={!filteredRows.length}><Download className="mr-2 h-4 w-4" />JSON</Button>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : filteredRows.length === 0 ? <p className="text-sm text-muted-foreground">No matching records.</p> : filteredRows.map((row) => {
            const key = String(row.id ?? row.key);
            const owner = userById.get(String(row.userId));
            return <div key={`${row.userId}-${key}`} className="rounded-xl border border-border p-4"><div className="mb-2 flex items-center justify-between gap-3"><Badge variant="outline">{owner?.email ?? String(row.userId ?? "unknown")}</Badge><Button variant="ghost" size="icon" onClick={() => void remove(row)}><Trash2 className="text-destructive" /></Button></div><Textarea value={drafts[key] ?? JSON.stringify(row, null, 2)} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="min-h-36 font-mono text-xs" /><Button className="mt-3" size="sm" onClick={() => void save(row)}>Save changes</Button></div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
