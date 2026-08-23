import { NextResponse } from "next/server";
import { initCatalyst, zcqlQuery, zcqlEscape, upsertRow } from "@/lib/db/catalyst-client";

export const runtime = "nodejs";

// Map client camelCase table keys → Catalyst table names + field transforms
const TABLE_CONFIG = {
  timeEntries: {
    table: "time_entries_koku",
    toFields: (r: Record<string, unknown>) => ({
      title: r.title ?? "",
      project_id: r.projectId ?? "",
      category_id: r.categoryId ?? "",
      start_at: r.startAt ?? "",
      end_at: r.endAt ?? "",
      duration_sec: r.durationSec ?? 0,
      tags: JSON.stringify(r.tags ?? []),
      notes: r.notes ?? "",
      created_at: r.createdAt ?? "",
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r["time_entries_koku"] ?? r) as Record<string, unknown>;
      return {
        id: d.id,
        title: d.title,
        projectId: d.project_id || null,
        categoryId: d.category_id || null,
        startAt: d.start_at || null,
        endAt: d.end_at || null,
        durationSec: d.duration_sec ? Number(d.duration_sec) : null,
        tags: tryParse(d.tags as string, []),
        notes: d.notes || null,
        createdAt: d.created_at,
      };
    },
    sinceField: "created_at",
  },
  projects: {
    table: "projects_koku",
    toFields: (r: Record<string, unknown>) => ({
      name: r.name ?? "",
      color: r.color ?? "#888888",
      hourly_rate: String(r.hourlyRate ?? ""),
      created_at: r.createdAt ?? "",
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r["projects_koku"] ?? r) as Record<string, unknown>;
      return {
        id: d.id,
        name: d.name,
        color: d.color,
        hourlyRate: d.hourly_rate ? parseFloat(d.hourly_rate as string) : null,
        createdAt: d.created_at,
      };
    },
    sinceField: "created_at",
  },
  categories: {
    table: "categories_koku",
    toFields: (r: Record<string, unknown>) => ({
      name: r.name ?? "",
      color: r.color ?? "#888888",
      created_at: r.createdAt ?? "",
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r["categories_koku"] ?? r) as Record<string, unknown>;
      return { id: d.id, name: d.name, color: d.color, createdAt: d.created_at };
    },
    sinceField: "created_at",
  },
  notes: {
    table: "notes_koku",
    toFields: (r: Record<string, unknown>) => ({
      title: r.title ?? "",
      slug: r.slug ?? "",
      content: JSON.stringify(r.content ?? null),
      tags: JSON.stringify(r.tags ?? []),
      created_at: r.createdAt ?? "",
      updated_at: r.updatedAt ?? "",
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r["notes_koku"] ?? r) as Record<string, unknown>;
      return {
        id: d.id,
        title: d.title,
        slug: d.slug,
        content: tryParse(d.content as string, null),
        tags: tryParse(d.tags as string, []),
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    },
    sinceField: "updated_at",
  },
  noteLinks: {
    table: "note_links_koku",
    toFields: (r: Record<string, unknown>) => ({
      source_note_id: r.sourceNoteId ?? "",
      target_note_id: r.targetNoteId ?? "",
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r["note_links_koku"] ?? r) as Record<string, unknown>;
      return { id: d.id, sourceNoteId: d.source_note_id, targetNoteId: d.target_note_id };
    },
    sinceField: null,
  },
  settings: {
    table: "settings_koku",
    toFields: (r: Record<string, unknown>) => ({
      setting_key: r.key ?? "",
      setting_value: JSON.stringify(r.value ?? null),
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r["settings_koku"] ?? r) as Record<string, unknown>;
      return { key: d.setting_key, value: tryParse(d.setting_value as string, null) };
    },
    sinceField: null,
  },
} as const;

type TableKey = keyof typeof TABLE_CONFIG;

function tryParse<T>(str: string | undefined | null, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

async function getCurrentUser(request: Request) {
  try {
    const app = initCatalyst(request);
    const user = await app.userManagement().getCurrentUser();
    return { app, userId: user.user_id };
  } catch {
    return null;
  }
}

// GET /api/sync/[table]?since=ISO — pull rows
export async function GET(
  request: Request,
  context: { params: Promise<{ table: string }> },
): Promise<NextResponse> {
  const auth = await getCurrentUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await context.params;
  if (!(table in TABLE_CONFIG)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });

  const config = TABLE_CONFIG[table as TableKey];
  const url = new URL(request.url);
  const since = url.searchParams.get("since");

  let sql = `SELECT * FROM ${config.table} WHERE user_id = '${zcqlEscape(auth.userId)}'`;
  if (since && config.sinceField) {
    sql += ` AND ${config.sinceField} > '${zcqlEscape(since)}'`;
  }

  const rows = await zcqlQuery(auth.app, sql);
  const fromRow = config.fromRow as (r: Record<string, unknown>) => unknown;
  return NextResponse.json({ rows: rows.map(fromRow) });
}

// POST /api/sync/[table] — push (upsert) rows
export async function POST(
  request: Request,
  context: { params: Promise<{ table: string }> },
): Promise<NextResponse> {
  const auth = await getCurrentUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await context.params;
  if (!(table in TABLE_CONFIG)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });

  const config = TABLE_CONFIG[table as TableKey];
  const body = (await request.json()) as { rows?: unknown[] };
  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ synced: 0 });

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? r.key ?? "");
    if (!id) continue;
    const fields = config.toFields(r);
    await upsertRow(auth.app, config.table, auth.userId, id, fields);
  }

  return NextResponse.json({ synced: rows.length });
}

// DELETE /api/sync/[table]?id=xxx — remove row
export async function DELETE(
  request: Request,
  context: { params: Promise<{ table: string }> },
): Promise<NextResponse> {
  const auth = await getCurrentUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table } = await context.params;
  if (!(table in TABLE_CONFIG)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });

  const config = TABLE_CONFIG[table as TableKey];
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Get ROWID first then delete
  const existing = await zcqlQuery(
    auth.app,
    `SELECT ROWID FROM ${config.table} WHERE id = '${zcqlEscape(id)}' AND user_id = '${zcqlEscape(auth.userId)}'`,
  );

  if (existing.length > 0) {
    const raw = existing[0] as Record<string, unknown>;
    const nested = raw[config.table] as Record<string, unknown> | undefined;
    const rowId = (nested?.ROWID ?? raw.ROWID) as string | number;
    await auth.app.datastore().table(config.table).deleteRow(rowId);
  }

  return NextResponse.json({ deleted: true });
}
