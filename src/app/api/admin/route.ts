import { NextResponse } from "next/server";

import { initCatalyst, upsertRow, zcqlEscape, zcqlQuery } from "@/lib/db/catalyst-client";
import { TABLE_CONFIG } from "@/lib/sync/table-config";
import { deleteAdminGroup, getAdminGroups, getAdminKeys, isOwnerUser, saveAdminGroup, setAdmin, type AdminGroup } from "@/lib/auth/user-registry";
import { adminUserFromDetails, calculateAdminStats, extractCatalystRowId, type AdminPresence, type AdminUser } from "@/lib/admin-data";

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

    const requested = new URL(request.url).searchParams.get("table");
    const tables = requested ? [requested] : Object.keys(TABLE_CONFIG).filter((table) => table !== "settings");
    if (tables.includes("settings")) return NextResponse.json({ error: "Settings are internal" }, { status: 400 });
    const data: Record<string, unknown[]> = {};

    for (const table of tables) {
      const config = getConfig(table);
      if (!config) return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
      const rows = await zcqlQuery(auth.app, `SELECT * FROM ${config.table}`);
      const fromRow = config.fromRow as (row: Record<string, unknown>) => Record<string, unknown>;
      data[table] = rows.map((raw) => {
        const nested = (raw[config.table] ?? raw) as Record<string, unknown>;
        return { ...fromRow(raw), userId: nested.user_id ?? raw.user_id };
      });
    }

    const usersById = new Map<string, AdminUser>();
    // Row owners are authoritative. Bulk user listing can omit users or fail for
    // delegated admins, while per-user lookup still resolves each stored user_id.
    const rowUserIds = new Set(
      Object.values(data).flatMap((rows) => rows.map((row) => String((row as Record<string, unknown>).userId ?? "").trim()).filter(Boolean)),
    );
    rowUserIds.add(String(auth.user.user_id));
    try {
      const allUsers = await auth.app.userManagement().getAllUsers();
      for (const user of allUsers) {
        const mapped = adminUserFromDetails(user);
        if (mapped) usersById.set(mapped.id, mapped);
      }
    } catch {
      // Per-user lookup below still works when bulk user-list scope unavailable.
    }
    await Promise.all([...rowUserIds].map(async (userId) => {
      try {
        const mapped = adminUserFromDetails(await auth.app.userManagement().getUserDetails(userId));
        if (mapped) usersById.set(mapped.id, mapped);
      } catch {
        // Keep row visible with ID fallback if identity lookup unavailable.
      }
    }));
    const users = [...rowUserIds, ...usersById.keys()].filter((id, index, all) => all.indexOf(id) === index).map((id) => usersById.get(id) ?? {
      id,
      email: id,
      displayName: "",
    });
    // Include users returned by bulk listing even when they have no rows.
    for (const user of usersById.values()) {
      if (!users.some((item) => item.id === user.id)) users.push(user);
    }
    const delegatedAdminIds = (await getAdminKeys(auth.app)).map((key) => key.slice("admin_user:".length));
    const adminIds = new Set([auth.user.user_id, ...delegatedAdminIds]);
    const admins = users.filter((user) => adminIds.has(user.id));
    const presence: Record<string, AdminPresence> = {};
    try {
      const settings = await zcqlQuery(auth.app, `SELECT * FROM ${TABLE_CONFIG.settings.table}`);
      for (const raw of settings) {
        const nested = (raw[TABLE_CONFIG.settings.table] ?? raw) as Record<string, unknown>;
        if (nested.setting_key !== "adminPresence" || typeof nested.setting_value !== "string" || !nested.user_id) continue;
        try {
          const value = JSON.parse(nested.setting_value) as AdminPresence;
          if (typeof value.seenAt === "string" && typeof value.visible === "boolean" && typeof value.focused === "boolean") {
            const userId = String(nested.user_id);
            const previous = presence[userId];
            if (!previous || Date.parse(value.seenAt) >= Date.parse(previous.seenAt)) presence[userId] = value;
          }
        } catch { /* corrupt operational metadata is ignored */ }
      }
    } catch { /* presence is optional operational metadata */ }
    const stats: Record<string, ReturnType<typeof calculateAdminStats>> = {};
    for (const user of users) {
      const userRows = Object.entries(data).flatMap(([table, rows]) => rows.filter((row) => String((row as Record<string, unknown>).userId) === user.id).map((row) => ({ ...(row as Record<string, unknown>), table })));
      stats[user.id] = calculateAdminStats(userRows);
    }
    // Groups are workspace data. Every admin may view them; only owner may mutate them.
    const groups = await getAdminGroups(auth.app);
    return NextResponse.json({ data, users, admins, groups, stats, presence, ownerUserId: auth.user.user_id, canManageAdmins: auth.isOwner });
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
