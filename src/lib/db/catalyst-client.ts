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

function nestedRow(raw: Record<string, unknown>, tableName: string) {
  return (raw[tableName] ?? raw) as Record<string, unknown>;
}

function rowId(raw: Record<string, unknown>, tableName: string): string | number | null {
  const value = nestedRow(raw, tableName).ROWID ?? raw.ROWID;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

/** Upsert one logical row and self-heal duplicate rows left by older writes. */
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

  if (existing.length === 0) {
    await table.insertRow({ id, user_id: userId, ...fields });
    return;
  }
  // Catalyst returns matching rows in stable insertion order here; last row is
  // newest for legacy duplicates. Keep it, then remove older copies.
  const indexed = existing.map((raw, index) => ({ raw: raw as Record<string, unknown>, index }));
  indexed.sort((a, b) => b.index - a.index);
  const keep = rowId(indexed[0].raw, tableName);
  if (keep === null) throw new Error(`Existing ${tableName} row has no ROWID`);
  await table.updateRow({ ROWID: keep, ...fields });
  for (const duplicate of indexed.slice(1)) {
    const duplicateId = rowId(duplicate.raw, tableName);
    if (duplicateId !== null) await table.deleteRow(duplicateId);
  }
}
