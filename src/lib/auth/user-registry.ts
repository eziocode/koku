import { upsertRow, zcqlEscape, zcqlQuery, type CatalystApp } from "@/lib/db/catalyst-client";

export const USER_TABLE = "users_koku";
export const ADMIN_KEY_PREFIX = "admin_user:";

export async function getAdminKeys(app: CatalystApp): Promise<string[]> {
  const rows = await zcqlQuery(app, `SELECT key_koku FROM ${USER_TABLE}`);
  return rows.flatMap((row) => {
    const nested = (row[USER_TABLE] ?? row) as Record<string, unknown>;
    const key = String(nested.key_koku ?? row.key_koku ?? "");
    return key.startsWith(ADMIN_KEY_PREFIX) ? [key] : [];
  });
}

export async function setAdmin(app: CatalystApp, targetUserId: string, ownerUserId: string, enabled: boolean) {
  const key = `${ADMIN_KEY_PREFIX}${targetUserId}`;
  if (enabled) {
    await upsertRow(app, USER_TABLE, targetUserId, key, {
      key_koku: key,
      value_koki: JSON.stringify({ userId: targetUserId, grantedBy: ownerUserId, updatedAt: new Date().toISOString() }),
    });
    return;
  }
  const rows = await zcqlQuery(app, `SELECT ROWID FROM ${USER_TABLE} WHERE key_koku = '${zcqlEscape(key)}' AND user_id = '${zcqlEscape(targetUserId)}'`);
  if (rows.length) {
    const raw = rows[0] as Record<string, unknown>;
    const nested = raw[USER_TABLE] as Record<string, unknown> | undefined;
    await app.datastore().table(USER_TABLE).deleteRow(nested?.ROWID ?? raw.ROWID);
  }
}
