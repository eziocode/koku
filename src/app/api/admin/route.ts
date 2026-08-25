import { NextResponse } from "next/server";

import { initCatalyst, upsertRow, zcqlEscape, zcqlQuery } from "@/lib/db/catalyst-client";
import { TABLE_CONFIG } from "@/lib/sync/table-config";
import { deleteAdminGroup, getAdminGroups, getAdminKeys, isOwnerUser, saveAdminGroup, setAdmin, type AdminGroup } from "@/lib/auth/user-registry";
import { adminUserFromDetails, calculateAdminStats, dashboardForRange, extractCatalystRowId, type AdminPresence, type AdminRow, type AdminUser } from "@/lib/admin-data";

export const runtime = "nodejs";

async function requireAdmin(request: Request) {
  const app = initCatalyst(request);
  const user = await app.userManagement().getCurrentUser();
  const isOwner = await isOwnerUser(app, user.user_id);
  if (isOwner) return { app, user, isOwner };

  const isDelegatedAdmin = (await getAdminKeys(app)).includes(`admin_user:${user.user_id}`);
  if (!isDelegatedAdmin) return null;
  return { app, user, isOwner };
}

function getConfig(table: string) {
  return table in TABLE_CONFIG ? TABLE_CONFIG[table as keyof typeof TABLE_CONFIG] : null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const userId = params.get("userId")?.trim();
    const requested = params.get("table");
    const usersById = new Map<string, AdminUser>();
    try {
      const allUsers = await auth.app.userManagement().getAllUsers();
      for (const user of allUsers) {
        const mapped = adminUserFromDetails(user);
        if (mapped) usersById.set(mapped.id, mapped);
      }
    } catch {
      // Directory fallback below.
    }
    const delegatedAdminIds = (await getAdminKeys(auth.app)).map((key) => key.slice("admin_user:".length));
    if (userId) {
      const user = usersById.get(userId) ?? adminUserFromDetails(await auth.app.userManagement().getUserDetails(userId));
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      const tables = Object.keys(TABLE_CONFIG).filter((table) => table !== "settings");
      const data: Record<string, AdminRow[]> = {};
      for (const table of tables) {
        const config = getConfig(table);
        if (!config) continue;
        const rows = await zcqlQuery(auth.app, `SELECT * FROM ${config.table} WHERE user_id = '${zcqlEscape(userId)}'`);
        data[table] = rows.map((raw) => ({ ...config.fromRow(raw), userId }));
      }
      const allRows: AdminRow[] = Object.entries(data).flatMap(([table, rows]) => rows.map((row) => ({ ...row, table })));
      const table = requested && requested !== "summary" ? requested : "timeEntries";
      if (table === "all") {
        const start = params.get("start"); const end = params.get("end");
        const from = start ? Date.parse(`${start}T00:00:00`) : Number.NEGATIVE_INFINITY;
        const until = end ? Date.parse(`${end}T23:59:59.999`) : Number.POSITIVE_INFINITY;
        const scoped = allRows.filter((row) => {
          const field = row.table === "timeEntries" ? row.startAt : row.table === "notes" ? row.updatedAt : row.createdAt;
          const value = Date.parse(String(field ?? row.createdAt ?? ""));
          return Number.isFinite(value) && value >= from && value <= until;
        }).sort((a, b) => String(b.startAt ?? b.updatedAt ?? b.createdAt).localeCompare(String(a.startAt ?? a.updatedAt ?? a.createdAt)));
        const limit = Math.min(Math.max(Number(params.get("limit") ?? 50) || 50, 1), 100);
        const offset = Math.max(Number(params.get("cursor") ?? 0) || 0, 0);
        const rows = scoped.slice(offset, offset + limit);
        return NextResponse.json({ user, rows, nextCursor: offset + rows.length < scoped.length ? String(offset + rows.length) : null });
      }
      if (!getConfig(table)) return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
      const start = params.get("start"); const end = params.get("end");
      const from = start ? Date.parse(`${start}T00:00:00`) : Number.NEGATIVE_INFINITY;
      const until = end ? Date.parse(`${end}T23:59:59.999`) : Number.POSITIVE_INFINITY;
      const dateField = table === "timeEntries" ? "startAt" : table === "notes" ? "updatedAt" : "createdAt";
      const scoped = (data[table] ?? []).filter((row) => { if (!start && !end) return true; const value = Date.parse(String(row[dateField] ?? row.createdAt ?? "")); return Number.isFinite(value) && value >= from && value <= until; }).sort((a, b) => String(b[dateField] ?? b.createdAt ?? "").localeCompare(String(a[dateField] ?? a.createdAt ?? "")));
      const limit = Math.min(Math.max(Number(params.get("limit") ?? 25) || 25, 1), 100);
      const offset = Math.max(Number(params.get("cursor") ?? 0) || 0, 0);
      const rows = scoped.slice(offset, offset + limit);
      let presence: AdminPresence | undefined;
      try { const settings = await zcqlQuery(auth.app, `SELECT * FROM ${TABLE_CONFIG.settings.table} WHERE user_id = '${zcqlEscape(userId)}'`); for (const raw of settings) { const nested = (raw[TABLE_CONFIG.settings.table] ?? raw) as Record<string, unknown>; if (nested.setting_key === "adminPresence" && typeof nested.setting_value === "string") { const value = JSON.parse(nested.setting_value) as AdminPresence; if (typeof value.seenAt === "string") presence = value; } } } catch { /* optional */ }
      return NextResponse.json({ user, rows, table, nextCursor: offset + rows.length < scoped.length ? String(offset + rows.length) : null, summary: calculateAdminStats(allRows), dashboard: dashboardForRange(allRows, `${start ?? "1900-01-01"}T00:00:00`, `${end ?? "2999-12-31"}T23:59:59.999`), presence });
    }
    const users = [...usersById.values()];
    // Presence is stored as one user-scoped settings row. Read it once for
    // directory ordering so admin does not need one request per user.
    try {
      const settings = await zcqlQuery(auth.app, `SELECT * FROM ${TABLE_CONFIG.settings.table}`);
      for (const raw of settings) {
        const nested = (raw[TABLE_CONFIG.settings.table] ?? raw) as Record<string, unknown>;
        if (nested.setting_key !== "adminPresence" || typeof nested.setting_value !== "string") continue;
        const userIdForPresence = String(nested.user_id ?? raw.user_id ?? "").trim();
        if (!userIdForPresence) continue;
        const user = usersById.get(userIdForPresence);
        if (!user) continue;
        try {
          const presence = JSON.parse(nested.setting_value) as AdminPresence;
          if (typeof presence.seenAt === "string") user.presence = presence;
        } catch { /* Ignore malformed optional presence rows. */ }
      }
    } catch { /* Directory still works when presence cannot be read. */ }
    if (!users.some((user) => user.id === String(auth.user.user_id))) { const current = adminUserFromDetails(auth.user); if (current) users.push(current); }
    const adminIds = new Set([auth.user.user_id, ...delegatedAdminIds]);
    const admins = users.filter((user) => adminIds.has(user.id));
    const groups = await getAdminGroups(auth.app);
    return NextResponse.json({ users, admins, groups, ownerUserId: auth.user.user_id, canManageAdmins: auth.isOwner });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!auth.isOwner) return NextResponse.json({ error: "Owner admin required" }, { status: 403 });

    const body = (await request.json()) as { action?: "add" | "remove" | "createGroup" | "updateGroup" | "deleteGroup"; userId?: string; group?: Partial<AdminGroup> };
    if (body.action === "createGroup") {
      const name = String(body.group?.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "Group name required" }, { status: 400 });
      const group: AdminGroup = { id: crypto.randomUUID(), name, userIds: [] };
      await saveAdminGroup(auth.app, auth.user.user_id, group);
      return NextResponse.json({ saved: true, group });
    }
    if (body.action === "updateGroup") {
      const groupId = String(body.group?.id ?? "");
      const name = String(body.group?.name ?? "").trim();
      if (!groupId || !name || !Array.isArray(body.group?.userIds)) return NextResponse.json({ error: "Group id, name, and userIds required" }, { status: 400 });
      const group: AdminGroup = { id: groupId, name, userIds: body.group.userIds.map(String) };
      await saveAdminGroup(auth.app, auth.user.user_id, group);
      return NextResponse.json({ saved: true, group });
    }
    if (body.action === "deleteGroup") {
      const groupId = String(body.group?.id ?? "");
      if (!groupId) return NextResponse.json({ error: "Group id required" }, { status: 400 });
      await deleteAdminGroup(auth.app, auth.user.user_id, groupId);
      return NextResponse.json({ saved: true });
    }
    if (!body.action || !body.userId || body.userId === auth.user.user_id) {
      return NextResponse.json({ error: "Valid action and userId required" }, { status: 400 });
    }
    await setAdmin(auth.app, body.userId, auth.user.user_id, body.action === "add");
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Unable to update admin users" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = (await request.json()) as { table?: string; userId?: string; row?: Record<string, unknown> };
    const config = body.table ? getConfig(body.table) : null;
    const id = body.row?.id ?? body.row?.key;
    if (!config || !body.userId || !id || !body.row) {
      return NextResponse.json({ error: "table, userId, row required" }, { status: 400 });
    }
    await upsertRow(auth.app, config.table, body.userId, String(id), config.toFields(body.row));
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Unable to update row" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const url = new URL(request.url);
    const tableName = url.searchParams.get("table");
    const userId = url.searchParams.get("userId");
    const id = url.searchParams.get("id");
    const config = tableName ? getConfig(tableName) : null;
    if (!config || !userId || !id || !id.trim()) return NextResponse.json({ error: "Valid table, userId, id required" }, { status: 400 });

    const rows = await zcqlQuery(auth.app, `SELECT ROWID FROM ${config.table} WHERE id = '${zcqlEscape(id)}' AND user_id = '${zcqlEscape(userId)}'`);
    if (rows.length) {
      const raw = rows[0] as Record<string, unknown>;
      const rowId = extractCatalystRowId(raw, config.table);
      if (rowId === null) return NextResponse.json({ error: "Row has no Catalyst ID" }, { status: 500 });
      await auth.app.datastore().table(config.table).deleteRow(rowId);
    }
    return NextResponse.json({ deleted: true, found: rows.length > 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete row";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
