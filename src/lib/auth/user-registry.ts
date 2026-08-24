import { upsertRow, zcqlEscape, zcqlQuery, type CatalystApp } from "@/lib/db/catalyst-client";
import { OWNER_KEY } from "@/lib/auth/constants";

export const USER_TABLE = "users_koku";
export const ADMIN_KEY_PREFIX = "admin_user:";
export const GROUP_KEY_PREFIX = "admin_group:";

export type AdminGroup = { id: string; name: string; userIds: string[] };

export async function isOwnerUser(app: CatalystApp, userId: string): Promise<boolean> {
  const rows = await zcqlQuery(app, `SELECT ROWID FROM ${USER_TABLE} WHERE key_koku = '${OWNER_KEY}' AND user_id = '${zcqlEscape(userId)}'`);
  return rows.length > 0;
}

export async function getAdminKeys(app: CatalystApp): Promise<string[]> {
  const rows = await zcqlQuery(app, `SELECT key_koku FROM ${USER_TABLE}`);
  return rows.flatMap((row) => {
    const nested = (row[USER_TABLE] ?? row) as Record<string, unknown>;
    const key = String(nested.key_koku ?? row.key_koku ?? "");
    return key.startsWith(ADMIN_KEY_PREFIX) ? [key] : [];
  });
}

export async function getAdminGroups(app: CatalystApp): Promise<AdminGroup[]> {
  const rows = await zcqlQuery(app, `SELECT key_koku, value_koku FROM ${USER_TABLE}`);
  return rows.flatMap((row) => {
    const nested = (row[USER_TABLE] ?? row) as Record<string, unknown>;
    const key = String(nested.key_koku ?? row.key_koku ?? "");
    if (!key.startsWith(GROUP_KEY_PREFIX)) return [];
    try {
      const value = JSON.parse(String(nested.value_koku ?? row.value_koku ?? "{}")) as Partial<AdminGroup>;
      const id = String(value.id ?? key.slice(GROUP_KEY_PREFIX.length));
      const name = String(value.name ?? "").trim();
      const userIds = Array.isArray(value.userIds) ? value.userIds.map(String) : [];
      return name ? [{ id, name, userIds }] : [];
    } catch {
      return [];
    }
  });
}

export async function saveAdminGroup(app: CatalystApp, ownerUserId: string, group: AdminGroup) {
  const key = `${GROUP_KEY_PREFIX}${group.id}`;
  await upsertRow(app, USER_TABLE, ownerUserId, key, {
    key_koku: key,
    value_koku: JSON.stringify({ ...group, userIds: [...new Set(group.userIds)] }),
  });
}

export async function deleteAdminGroup(app: CatalystApp, ownerUserId: string, groupId: string) {
  const key = `${GROUP_KEY_PREFIX}${groupId}`;
  const rows = await zcqlQuery(app, `SELECT ROWID FROM ${USER_TABLE} WHERE key_koku = '${zcqlEscape(key)}' AND user_id = '${zcqlEscape(ownerUserId)}'`);
  for (const raw of rows) {
    const record = raw as Record<string, unknown>;
    const nested = record[USER_TABLE] as Record<string, unknown> | undefined;
    const rowId = nested?.ROWID ?? record.ROWID;
    if (typeof rowId === "string" || typeof rowId === "number") await app.datastore().table(USER_TABLE).deleteRow(rowId);
  }
}

export async function setAdmin(app: CatalystApp, targetUserId: string, ownerUserId: string, enabled: boolean) {
  const key = `${ADMIN_KEY_PREFIX}${targetUserId}`;
  if (enabled) {
    await upsertRow(app, USER_TABLE, targetUserId, key, {
      key_koku: key,
      value_koku: JSON.stringify({ userId: targetUserId, grantedBy: ownerUserId, updatedAt: new Date().toISOString() }),
    });
    return;
  }
  const rows = await zcqlQuery(app, `SELECT ROWID FROM ${USER_TABLE} WHERE key_koku = '${zcqlEscape(key)}' AND user_id = '${zcqlEscape(targetUserId)}'`);
  for (const raw of rows) {
    const record = raw as Record<string, unknown>;
    const nested = record[USER_TABLE] as Record<string, unknown> | undefined;
    const rowId = nested?.ROWID ?? record.ROWID;
    if (typeof rowId !== "string" && typeof rowId !== "number") continue;
    try {
      await app.datastore().table(USER_TABLE).deleteRow(rowId);
    } catch (error) {
      if ((error as { code?: unknown }).code !== "INVALID_ID") throw error;
    }
  }
}
