import { upsertRow, zcqlEscape, zcqlQuery, type CatalystApp } from "@/lib/db/catalyst-client";
import { OWNER_KEY } from "@/lib/auth/constants";

export const USER_TABLE = "users_koku";
export const ADMIN_KEY_PREFIX = "admin_user:";
export const GROUP_KEY_PREFIX = "admin_group:";

export type AdminGroup = { id: string; name: string; userIds: string[] };

type RegistryRow = Record<string, unknown>;

function registryFields(raw: RegistryRow): RegistryRow {
  const nested = raw[USER_TABLE];
  return nested && typeof nested === "object" ? nested as RegistryRow : raw;
}

function registryValue(raw: RegistryRow, field: string): unknown {
  const nested = registryFields(raw);
  return nested[field] ?? raw[field];
}

function registryKey(raw: RegistryRow): string {
  // Older/manual Catalyst rows may put logical key in `id`; current writes use `key_koku`.
  const key = String(registryValue(raw, "key_koku") ?? "");
  if (key === OWNER_KEY || key.startsWith(ADMIN_KEY_PREFIX) || key.startsWith(GROUP_KEY_PREFIX)) return key;
  return String(registryValue(raw, "id") ?? key);
}

function registryUserId(raw: RegistryRow): string {
  return String(registryValue(raw, "user_id") ?? "");
}

function registryValueJson(raw: RegistryRow): RegistryRow {
  const value = registryValue(raw, "value_koku");
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as RegistryRow : {};
  } catch {
    return {};
  }
}

export async function isOwnerUser(app: CatalystApp, userId: string): Promise<boolean> {
  const rows = await zcqlQuery(app, `SELECT * FROM ${USER_TABLE}`);
  return rows.some((raw) => {
    const key = registryKey(raw);
    const value = registryValueJson(raw);
    return key === OWNER_KEY && (registryUserId(raw) === userId || String(value.userId ?? "") === userId)
      || key === "" && value.role === "owner" && String(value.userId ?? "") === userId;
  });
}

export async function getAdminKeys(app: CatalystApp): Promise<string[]> {
  const rows = await zcqlQuery(app, `SELECT * FROM ${USER_TABLE}`);
  return rows.flatMap((raw) => {
    const key = registryKey(raw);
    return key.startsWith(ADMIN_KEY_PREFIX) ? [key] : [];
  });
}

export async function getAdminGroups(app: CatalystApp): Promise<AdminGroup[]> {
  const rows = await zcqlQuery(app, `SELECT * FROM ${USER_TABLE}`);
  return rows.flatMap((row) => {
    const key = registryKey(row);
    if (!key.startsWith(GROUP_KEY_PREFIX)) return [];
    try {
      const value = registryValueJson(row) as Partial<AdminGroup>;
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
