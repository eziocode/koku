// eslint-disable-next-line @typescript-eslint/no-require-imports
const catalyst = require("zcatalyst-sdk-node");

export type CatalystApp = ReturnType<typeof catalyst.initialize>;

/** Initialize Catalyst SDK from a Next.js App Router Request */
export function initCatalyst(request: Request): CatalystApp {
  const headers = Object.fromEntries(request.headers.entries());
  return catalyst.initialize({ headers });
}

/** Escape a string value for safe interpolation into a ZCQL query */
export function zcqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

/** Execute a ZCQL SELECT and return rows, or [] if no results */
export async function zcqlQuery(
  app: CatalystApp,
  sql: string,
): Promise<Record<string, unknown>[]> {
  try {
    const rows = await app.zcql().executeZCQLQuery(sql);
    return Array.isArray(rows) ? rows : [];
  } catch (err: unknown) {
    // Catalyst returns an error when query returns 0 rows in some SDK versions
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no records") || msg.includes("EMPTY_RESULT")) return [];
    throw err;
  }
}

/** Upsert a row: insert if id not found for user, update (by ROWID) if found */
export async function upsertRow(
  app: CatalystApp,
  tableName: string,
  userId: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const existing = await zcqlQuery(
    app,
    `SELECT ROWID FROM ${tableName} WHERE id = '${zcqlEscape(id)}' AND user_id = '${zcqlEscape(userId)}'`,
  );

  const table = app.datastore().table(tableName);

  if (existing.length > 0) {
    const raw = existing[0] as Record<string, unknown>;
    const nested = raw[tableName] as Record<string, unknown> | undefined;
    const rowId = (nested?.ROWID ?? raw.ROWID) as string | number;
    await table.updateRow({ ROWID: rowId, ...fields });
  } else {
    await table.insertRow({ id, user_id: userId, ...fields });
  }
}
