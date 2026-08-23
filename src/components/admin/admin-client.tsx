"use client";

import { useEffect, useMemo, useState } from "react";
import { Shield, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const TABLES = ["timeEntries", "projects", "categories", "notes", "noteLinks"] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;
type User = { id: string; email: string; displayName: string };

export function AdminClient() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [table, setTable] = useState<Table>("timeEntries");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);

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
      setRows([]);
      toast.error("Admin access required.");
    } else if (res.ok) {
      const body = (await res.json()) as { data: Record<string, Row[]>; users?: User[] };
      setRows(body.data[nextTable] ?? []);
      setUsers(body.users ?? []);
    }
    setLoading(false);
  }

  // Fetch table whenever admin switches dataset.
  useEffect(() => {
    if (access === "allowed") void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [access, table]); // eslint-disable-line react-hooks/exhaustive-deps

  const userCount = useMemo(() => new Set(rows.map((row) => String(row.userId ?? "unknown"))).size, [rows]);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

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

  if (access === "checking") {
    return <p className="text-sm text-muted-foreground">Checking admin access…</p>;
  }

  if (access === "denied") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>This panel is available only to the administrator.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">All workspace data</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Admin-only view for every signed-in user. Edit or delete records across workspace.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Admin control</CardTitle><CardDescription>{rows.length} {table} records · {userCount} users in current table</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">{TABLES.map((item) => <Button key={item} size="sm" variant={table === item ? "default" : "outline"} onClick={() => setTable(item)}>{item}</Button>)}</div>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No records.</p> : rows.map((row) => {
            const key = String(row.id ?? row.key);
            const owner = userById.get(String(row.userId));
            return <div key={`${row.userId}-${key}`} className="rounded-xl border border-border p-4"><div className="mb-2 flex items-center justify-between gap-3"><Badge variant="outline">user: {owner?.email ?? String(row.userId ?? "unknown")}</Badge><Button variant="ghost" size="icon" onClick={() => void remove(row)}><Trash2 className="text-destructive" /></Button></div><Textarea value={drafts[key] ?? JSON.stringify(row, null, 2)} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="min-h-36 font-mono text-xs" /><Button className="mt-3" size="sm" onClick={() => void save(row)}>Save changes</Button></div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
