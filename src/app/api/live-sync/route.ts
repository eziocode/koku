import { NextResponse } from "next/server";

import { initCatalyst, zcqlEscape, zcqlQuery } from "@/lib/db/catalyst-client";
import { toCatalystDateTime } from "@/lib/db/catalyst-datetime";

export const runtime = "nodejs";

const TIMER_TABLE = "live_timers_koku";
const BREAK_TABLE = "live_breaks_koku";
const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;
type Mutation = Row & { id: string; revision: number; deletedAt?: string | null };

function nested(raw: Row, table: string): Row { return (raw[table] ?? raw) as Row; }
function iso(value: unknown): string | null { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null; }
function validMutation(value: unknown): value is Mutation {
  return Boolean(value && typeof value === "object" && typeof (value as Row).id === "string" && Number.isInteger((value as Row).revision) && Number((value as Row).revision) >= 0);
}
function validTimer(value: Mutation): boolean {
  if (value.deletedAt) return true;
  return typeof value.title === "string" && iso(value.startAt) !== null && Array.isArray(value.tags)
    && value.tags.every((tag) => typeof tag === "string") && typeof value.elapsedBeforePauseSec === "number"
    && Number.isFinite(value.elapsedBeforePauseSec) && typeof value.pomodoroMode === "boolean"
    && (value.pausedAt === null || value.pausedAt === undefined || iso(value.pausedAt) !== null);
}
function validBreak(value: Mutation): boolean {
  if (value.deletedAt) return true;
  return typeof value.label === "string" && iso(value.startedAt) !== null && typeof value.plannedDurationSec === "number"
    && Number.isFinite(value.plannedDurationSec) && value.plannedDurationSec >= 0 && Array.isArray(value.pausedTimerIds)
    && value.pausedTimerIds.every((id) => typeof id === "string");
}
function timerFromRow(raw: Row): Row {
  const value = nested(raw, TIMER_TABLE);
  return { id: value.id, title: value.title, projectId: value.project_id ?? null, categoryId: value.category_id ?? null,
    tags: parseJson(value.tags, []), notes: value.notes ?? null, startAt: value.start_at, elapsedBeforePauseSec: Number(value.elapsed_before_pause_sec ?? 0),
    pausedAt: value.paused_at ?? null, pomodoroMode: value.pomodoro_mode === true || value.pomodoro_mode === "true", parentTimerId: value.parent_timer_id ?? null,
    revision: Number(value.revision ?? 0), updatedAt: value.updated_at, deletedAt: value.deleted_at ?? null };
}
function breakFromRow(raw: Row): Row {
  const value = nested(raw, BREAK_TABLE);
  return { id: value.id, label: value.label, startedAt: value.started_at, plannedDurationSec: Number(value.planned_duration_sec ?? 0),
    pausedTimerIds: parseJson(value.paused_timer_ids, []), notes: value.notes ?? null, revision: Number(value.revision ?? 0), updatedAt: value.updated_at, deletedAt: value.deleted_at ?? null };
}
function parseJson(value: unknown, fallback: string[]) { try { return typeof value === "string" ? JSON.parse(value) : fallback; } catch { return fallback; } }
function fields(table: string, mutation: Mutation, revision: number): Row {
  const common = { revision, updated_at: new Date().toISOString(), deleted_at: mutation.deletedAt ?? null };
  if (table === TIMER_TABLE) return { ...common, title: mutation.title ?? "", project_id: mutation.projectId ?? null, category_id: mutation.categoryId ?? null,
    tags: JSON.stringify(Array.isArray(mutation.tags) ? mutation.tags : []), notes: mutation.notes ?? null, start_at: toCatalystDateTime(mutation.startAt) ?? "", elapsed_before_pause_sec: Number(mutation.elapsedBeforePauseSec ?? 0),
    paused_at: mutation.pausedAt === null || mutation.pausedAt === undefined ? null : toCatalystDateTime(mutation.pausedAt), pomodoro_mode: Boolean(mutation.pomodoroMode), parent_timer_id: mutation.parentTimerId ?? null };
  return { ...common, label: mutation.label ?? "Break", started_at: toCatalystDateTime(mutation.startedAt) ?? "", planned_duration_sec: Number(mutation.plannedDurationSec ?? 0), paused_timer_ids: JSON.stringify(Array.isArray(mutation.pausedTimerIds) ? mutation.pausedTimerIds : []), notes: mutation.notes ?? null };
}
async function user(request: Request) {
  try { const app = initCatalyst(request); const value = await app.userManagement().getCurrentUser(); return { app, id: value.user_id }; } catch { return null; }
}
async function apply(app: ReturnType<typeof initCatalyst>, userId: string, table: string, mutation: Mutation): Promise<{ row?: Row; conflict?: Row }> {
  const found = await zcqlQuery(app, `SELECT * FROM ${table} WHERE id = '${zcqlEscape(mutation.id)}' AND user_id = '${zcqlEscape(userId)}'`);
  const current = found[0] ? nested(found[0], table) : null;
  const currentRevision = Number(current?.revision ?? 0);
  if (current && currentRevision !== mutation.revision) return { conflict: table === TIMER_TABLE ? timerFromRow(found[0]) : breakFromRow(found[0]) };
  const next = fields(table, mutation, currentRevision + 1);
  const datastore = app.datastore().table(table);
  if (current) await datastore.updateRow({ ROWID: current.ROWID, ...next });
  else await datastore.insertRow({ id: mutation.id, user_id: userId, ...next });
  const raw = { [table]: { id: mutation.id, ...next } };
  return { row: table === TIMER_TABLE ? timerFromRow(raw) : breakFromRow(raw) };
}

export async function GET(request: Request) {
  const auth = await user(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_MS).toISOString();
  const [timers, breaks] = await Promise.all([zcqlQuery(auth.app, `SELECT * FROM ${TIMER_TABLE} WHERE user_id = '${zcqlEscape(auth.id)}'`), zcqlQuery(auth.app, `SELECT * FROM ${BREAK_TABLE} WHERE user_id = '${zcqlEscape(auth.id)}'`)]);
  const purge = async (rows: Row[], table: string) => Promise.all(rows.map(async (raw) => {
    const value = nested(raw, table);
    if (value.deleted_at && String(value.deleted_at) <= cutoff && value.ROWID !== undefined) await auth.app.datastore().table(table).deleteRow(value.ROWID as string | number);
  }));
  await Promise.all([purge(timers, TIMER_TABLE), purge(breaks, BREAK_TABLE)]);
  return NextResponse.json({ timers: timers.map(timerFromRow).filter((x) => !x.deletedAt || String(x.deletedAt) > cutoff), breaks: breaks.map(breakFromRow).filter((x) => !x.deletedAt || String(x.deletedAt) > cutoff) });
}

export async function POST(request: Request) {
  const auth = await user(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const requests: Array<[string, unknown]> = [[TIMER_TABLE, body.timers], [BREAK_TABLE, body.breaks], [TIMER_TABLE, body.timerTombstones], [BREAK_TABLE, body.breakTombstones]];
  const timers: Row[] = []; const breaks: Row[] = []; let conflicts = false;
  for (const [table, values] of requests) for (const value of Array.isArray(values) ? values : []) {
    if (!validMutation(value) || !(table === TIMER_TABLE ? validTimer(value) : validBreak(value))) return NextResponse.json({ error: "Invalid live-state record" }, { status: 400 });
    if (value.deletedAt !== undefined && value.deletedAt !== null && !iso(value.deletedAt)) return NextResponse.json({ error: "Invalid tombstone" }, { status: 400 });
    const result = await apply(auth.app, auth.id, table, value);
    if (result.conflict) { conflicts = true; (table === TIMER_TABLE ? timers : breaks).push(result.conflict); }
    else if (result.row) (table === TIMER_TABLE ? timers : breaks).push(result.row);
  }
  return NextResponse.json({ timers, breaks, conflicts }, { status: conflicts ? 409 : 200 });
}
