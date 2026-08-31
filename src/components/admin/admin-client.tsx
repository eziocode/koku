"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, Search, Shield, Trash2, UserPlus, UserRoundMinus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { sortAdminUsersByPresence, type AdminGroup, type AdminUser } from "@/lib/admin-data";
import { GROUP_MEMBER_SEARCH_THRESHOLD } from "@/lib/ui/list-thresholds";

type ConfirmAction =
  | { type: "removeAdmin"; userId: string; email: string }
  | { type: "addAdmin"; userId: string; email: string }
  | { type: "deleteGroup"; group: AdminGroup };

function ConfirmDialog({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!action) return null;
  const title =
    action.type === "removeAdmin"
      ? "Remove admin access"
      : action.type === "addAdmin"
        ? "Grant admin access"
        : "Delete group";
  const description =
    action.type === "removeAdmin"
      ? `Remove admin access from ${action.email}? They will no longer be able to manage workspace settings.`
      : action.type === "addAdmin"
        ? `Grant admin access to ${action.email}? They will be able to manage workspace settings and view all users.`
        : `Delete group "${action.group.name}"? Users will stay unchanged but the group will be permanently removed.`;
  const confirmLabel =
    action.type === "removeAdmin" ? "Remove admin"
    : action.type === "addAdmin" ? "Grant access"
    : "Delete group";
  const isDestructive = action.type === "removeAdmin" || action.type === "deleteGroup";

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={isDestructive ? "destructive" : "default"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminClient() {
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [search, setSearch] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newAdminId, setNewAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<ConfirmAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((b: { user?: { isAdmin?: boolean } | null }) =>
        setAccess(b.user?.isAdmin ? "allowed" : "denied"),
      )
      .catch(() => setAccess("denied"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.status === 403) setAccess("denied");
    if (response.ok) {
      const body = (await response.json()) as {
        users?: AdminUser[];
        admins?: AdminUser[];
        groups?: AdminGroup[];
        ownerUserId?: string;
        canManageAdmins?: boolean;
      };
      setUsers(body.users ?? []);
      setAdmins(body.admins ?? []);
      setGroups(body.groups ?? []);
      setOwnerUserId(body.ownerUserId ?? "");
      setCanManageAdmins(body.canManageAdmins === true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (access === "allowed") void load();
  }, [access, load]);

  async function execChangeAdmin(action: "add" | "remove", userId: string) {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    if (!response.ok) { toast.error(await errorMessage(response, "Admin change failed.")); return; }
    toast.success(action === "add" ? "Admin added." : "Admin removed.");
    setNewAdminId("");
    await load();
  }

  async function execDeleteGroup(group: AdminGroup) {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteGroup", group: { id: group.id } }),
    });
    if (!response.ok) { toast.error(await errorMessage(response, "Group deletion failed.")); return; }
    toast.success("Group deleted.");
    await load();
  }

  function requestChangeAdmin(action: "add" | "remove", userId: string) {
    const user = users.find((u) => u.id === userId) ?? admins.find((u) => u.id === userId);
    if (!user) return;
    setPendingAction(action === "remove"
      ? { type: "removeAdmin", userId, email: user.email }
      : { type: "addAdmin", userId, email: user.email });
  }

  function requestDeleteGroup(group: AdminGroup) {
    setPendingAction({ type: "deleteGroup", group });
  }

  async function handleConfirm() {
    if (!pendingAction) return;
    const action = pendingAction;
    setConfirming(true);
    try {
      if (action.type === "removeAdmin") await execChangeAdmin("remove", action.userId);
      else if (action.type === "addAdmin") await execChangeAdmin("add", action.userId);
      else if (action.type === "deleteGroup") await execDeleteGroup(action.group);
    } finally {
      setConfirming(false);
      setPendingAction(null);
    }
  }

  const filteredUsers = sortAdminUsersByPresence(users.filter((user) =>
    `${user.displayName} ${user.email} ${user.id}`.toLowerCase().includes(search.trim().toLowerCase()),
  ));
  const availableAdmins = users.filter((user) => !admins.some((admin) => admin.id === user.id));

  if (access === "checking")
    return <p className="text-sm text-muted-foreground">Checking admin access…</p>;
  if (access === "denied")
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>This panel is available only to admin users.</CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <div className="space-y-8">
      <ConfirmDialog
        action={pendingAction}
        busy={confirming}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPendingAction(null)}
      />
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Workspace control center</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Manage admins, groups, and user directory.</p>
      </div>
      {canManageAdmins ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Admin users</CardTitle>
            <CardDescription>Only primary owner can manage delegated admins.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {admins.map((admin) => (
                <Badge key={admin.id} variant="outline" className="gap-2">
                  {admin.email}
                  {admin.id !== ownerUserId ? (
                    <button type="button" aria-label={`Remove ${admin.email}`}
                      onClick={() => requestChangeAdmin("remove", admin.id)}>
                      <UserRoundMinus className="h-3 w-3" />
                    </button>
                  ) : null}
                </Badge>
              ))}
            </div>
            <div className="flex max-w-xl gap-2">
              <select value={newAdminId} onChange={(e) => setNewAdminId(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select user to make admin</option>
                {availableAdmins.map((user) => (
                  <option key={user.id} value={user.id}>{user.displayName ? `${user.email} (${user.displayName})` : user.email}</option>
                ))}
              </select>
              <Button disabled={!newAdminId} onClick={() => requestChangeAdmin("add", newAdminId)}>
                <UserPlus className="mr-2 h-4 w-4" />Add
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <AdminGroups name={newGroupName} setName={setNewGroupName} onChanged={load} canManage={canManageAdmins} />
      <Card>
        <CardHeader>
          <CardTitle>Data explorer</CardTitle>
          <CardDescription>Open user for scoped analytics and records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by name or email…" />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-4">
                {groups.map((group) => (
                  <GroupSection key={group.id} group={group} users={filteredUsers}
                    canManage={canManageAdmins} onChanged={load}
                    onDelete={requestDeleteGroup}
                    onOpen={(id) => router.push(`/admin/users/${encodeURIComponent(id)}`)} />
                ))}
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Other users</h3>
                  <Badge variant="outline">
                    {filteredUsers.filter((user) => !groups.some((group) => group.userIds.includes(user.id))).length}
                  </Badge>
                </div>
                <LazyUserGrid
                  users={sortAdminUsersByPresence(filteredUsers.filter((user) => !groups.some((group) => group.userIds.includes(user.id))))}
                  onOpen={(id) => router.push(`/admin/users/${encodeURIComponent(id)}`)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminGroups({
  name,
  setName,
  canManage,
  onChanged,
}: {
  name: string;
  setName: (value: string) => void;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  async function createGroup() {
    const value = name.trim();
    if (!value) return;
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createGroup", group: { name: value } }),
    });
    if (!r.ok) { toast.error(await errorMessage(r, "Group creation failed.")); return; }
    setName("");
    toast.success("Group created.");
    await onChanged();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          {canManage ? "Create groups. Edit membership in Data explorer." : "Workspace groups."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <div className="flex max-w-xl gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="New group name"
              onKeyDown={(e) => { if (e.key === "Enter") void createGroup(); }} />
            <Button disabled={!name.trim()} onClick={() => void createGroup()}>Create group</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Group management owner-only.</p>
        )}
      </CardContent>
    </Card>
  );
}

function UserCard({ user, onOpen }: { user: AdminUser; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(user.id)}
      className="rounded-xl border p-4 text-left transition hover:border-primary hover:bg-muted/30">
      <p className="font-medium">{user.displayName || "Unnamed user"}</p>
      <p className="text-sm text-muted-foreground">{user.email}</p>
      <p className="mt-3 text-xs text-muted-foreground">Open details <span aria-hidden="true">→</span></p>
    </button>
  );
}

function LazyUserGrid({ users, onOpen }: { users: AdminUser[]; onOpen: (id: string) => void }) {
  const pageSize = 24;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const userKey = users.map((user) => user.id).join("|");

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [userKey]);

  const hasMore = visibleCount < users.length;
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount((count) => Math.min(count + pageSize, users.length));
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, users.length]);

  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-lg pr-1">
      <div className="grid gap-3 md:grid-cols-2">
        {users.slice(0, visibleCount).map((user) => <UserCard key={user.id} user={user} onOpen={onOpen} />)}
      </div>
      {hasMore ? <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">Loading more users…</div> : null}
      {!users.length ? <p className="py-4 text-sm text-muted-foreground">No matching users.</p> : null}
    </div>
  );
}

function GroupSection({
  group,
  users,
  canManage,
  onChanged,
  onDelete,
  onOpen,
}: {
  group: AdminGroup;
  users: AdminUser[];
  canManage: boolean;
  onChanged: () => Promise<void>;
  onDelete: (group: AdminGroup) => void;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(group.userIds);
  const [saving, setSaving] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  useEffect(() => { setIds(group.userIds); }, [group.userIds]);
  const dirty = ids.length !== group.userIds.length || ids.some((id) => !group.userIds.includes(id));

  function cancel() {
    setIds(group.userIds);
    setMemberQuery("");
    setOpen(false);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateGroup", group: { ...group, userIds: ids } }),
      });
      if (!r.ok) { toast.error(await errorMessage(r, "Group update failed.")); return; }
      setMemberQuery("");
      setOpen(false);
      toast.success("Group members saved.");
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  const members = users.filter((user) => ids.includes(user.id));
  const trimmedQuery = memberQuery.trim().toLowerCase();
  // Filtering only changes which rows are visible in the checklist below;
  // `ids` (and therefore `dirty`/`save`) stays keyed off every member, so a
  // member checked before a search narrows the list is never silently dropped.
  const visibleUsers = trimmedQuery
    ? users.filter(
        (user) =>
          (user.displayName || "").toLowerCase().includes(trimmedQuery) ||
          user.email.toLowerCase().includes(trimmedQuery),
      )
    : users;

  return (
    <section className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button type="button" className="text-left" onClick={() => setOpen(!open)}>
          <h3 className="font-semibold">{group.name}</h3>
          <p className="text-xs text-muted-foreground">{members.length} members</p>
        </button>
        {canManage ? (
          <div className="flex gap-1">
            {open ? (
              <>
                <Button size="icon" variant="ghost" aria-label="Save group members" disabled={!dirty || saving} onClick={() => void save()}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Cancel editing group" disabled={saving} onClick={cancel}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button size="icon" variant="ghost" aria-label={`Edit group ${group.name}`} onClick={() => setOpen(true)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Delete group ${group.name}`} onClick={() => onDelete(group)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {open && canManage ? (
        <div className="mb-3 space-y-2">
          {users.length > GROUP_MEMBER_SEARCH_THRESHOLD ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Search users by name or email"
                aria-label="Search group members"
                className="pl-9"
              />
              {trimmedQuery ? (
                <p className="mt-1 text-xs text-muted-foreground">{visibleUsers.length} of {users.length}</p>
              ) : null}
            </div>
          ) : null}
          <div className="max-h-56 space-y-2 overflow-auto">
            {visibleUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users match.</p>
            ) : (
              visibleUsers.map((user) => {
                const selected = ids.includes(user.id);
                return (
                  <label key={user.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={selected}
                      onChange={() => setIds(selected ? ids.filter((id) => id !== user.id) : [...ids, user.id])} />
                    <span>{user.displayName || "Unnamed user"}
                      <span className="block text-xs text-muted-foreground">{user.email}</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      <LazyUserGrid users={members} onOpen={onOpen} />
      {!members.length ? <p className="text-sm text-muted-foreground">No matching members.</p> : null}
    </section>
  );
}

async function errorMessage(response: Response, fallback: string) {
  try { return ((await response.json()) as { error?: string }).error || fallback; }
  catch { return fallback; }
}
