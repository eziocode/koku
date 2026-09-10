import { z } from "zod";
import { kokuDb, type RecoverySnapshot } from "./db";
import { normalizeAiKey } from "./hooks/use-ai-keys";
import { recoveredTimerSchema } from "./recovered-timer";

const id = z.string().min(1);
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Invalid date");
const tags = z.array(z.string());
const record = z.object({ id, createdAt: date }).passthrough();
const note = record.extend({ title: z.string(), slug: id, content: z.unknown(), tags, updatedAt: date });
const schemas = {
  projects: record.extend({ name: id, color: id }),
  categories: record.extend({ name: id, color: id }),
  timeEntries: record.extend({ title: z.string(), startAt: date, endAt: date.nullish(), durationSec: z.number().nonnegative().nullish(), tags,
    segments: z.array(z.object({ startAt: date, endAt: date })).nullish() }),
  tasks: record.extend({ title: z.string(), status: z.enum(["open", "in_progress", "paused", "done"]), priority: z.enum(["low", "medium", "high"]), tags, sortOrder: z.number(), updatedAt: date,
    accumulatedSec: z.number().nonnegative().default(0), inProgressSince: date.nullish().default(null) }),
  notes: note,
  personalNotes: note,
  noteLinks: z.object({ id, sourceNoteId: id, targetNoteId: id }).passthrough(),
  reminders: record.extend({ message: z.string(), triggerAt: date, repeat: z.enum(["none", "daily", "weekly", "custom"]), customDays: z.array(z.number().int().min(0).max(6)), active: z.boolean(), updatedAt: date }),
  aiKeys: record.extend({ provider: id, apiKey: z.string() }),
  settings: z.object({ key: id, value: z.unknown() }),
  noteDrafts: z.object({ id, noteId: id, scope: z.enum(["shared", "personal"]), payload: z.object({ title: z.string(), content: z.unknown(), tags }), baseUpdatedAt: date, updatedAt: date }),
  timerCompletions: z.object({ id, entryId: id, completedAt: date }),
};
export type BackupTable = keyof typeof schemas;
export const BACKUP_TABLES = Object.keys(schemas) as BackupTable[];
export interface BackupPayload { version: number; exportedAt: string; data: Partial<Record<BackupTable, Record<string, unknown>[]>>; timerState?: unknown }

export function isPortableSetting(key: string) {
  return !/^(lastSyncAt:|auth[.:]|session[.:]|local[.:])/.test(key);
}

/** Preserve document structure while removing executable links and images. */
function sanitizeContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeContent);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeContent(item)]));
  if (result.attrs && typeof result.attrs === "object") {
    const attrs = result.attrs as Record<string, unknown>;
    for (const key of ["href", "src"]) {
      if (typeof attrs[key] === "string" && !/^https?:\/\//i.test(attrs[key]) && !(key === "src" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(attrs[key]))) attrs[key] = "";
    }
  }
  return result;
}

export function parseBackup(input: unknown): BackupPayload {
  const outer = z.object({ version: z.union([z.literal(1), z.literal(2), z.literal(3)]), exportedAt: date,
    data: z.record(z.string(), z.unknown()), timerState: recoveredTimerSchema.optional() }).parse(input);
  if (!Object.keys(outer.data).some((key) => BACKUP_TABLES.includes(key as BackupTable))) throw new Error("Backup contains no supported collections.");
  const data: BackupPayload["data"] = {};
  for (const table of BACKUP_TABLES) {
    if (!(table in outer.data)) continue; // Older backups must never erase newer collections.
    let rows = z.array(schemas[table]).parse(outer.data[table]) as Record<string, unknown>[];
    const keys = rows.map((row) => String(row.id ?? row.key));
    if (new Set(keys).size !== keys.length) throw new Error(`Duplicate records in ${table}.`);
    if (table === "notes" || table === "personalNotes") rows = rows.map((row) => ({ ...row, content: sanitizeContent(row.content) }));
    if (table === "noteDrafts") rows = rows.map((row) => ({ ...row, payload: sanitizeContent(row.payload) }));
    if (table === "aiKeys") rows = rows.map((row) => normalizeAiKey(row as unknown as Parameters<typeof normalizeAiKey>[0]) as unknown as Record<string, unknown>);
    if (table === "settings") rows = rows.filter((row) => isPortableSetting(String(row.key)));
    data[table] = rows;
  }
  return { ...outer, data };
}

export async function createBackup(includeKeys = false): Promise<BackupPayload> {
  const data: BackupPayload["data"] = {};
  await kokuDb.transaction("r", BACKUP_TABLES.map((name) => kokuDb.table(name)), async () => {
    for (const name of BACKUP_TABLES) {
      if (name === "aiKeys" && !includeKeys) continue;
      const rows = await kokuDb.table(name).toArray();
      data[name] = name === "settings" ? rows.filter((row) => isPortableSetting(row.key)) : rows;
    }
  });
  let timerState: unknown;
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("koku-active-timer");
    if (stored) timerState = JSON.parse(stored).state;
  }
  return { version: 3, exportedAt: new Date().toISOString(), data, timerState };
}

/** Call inside the replacement transaction so quota failure aborts replacement. */
export async function captureRecovery(reason: string) {
  const data: RecoverySnapshot["data"] = {};
  for (const table of BACKUP_TABLES) data[table] = await kokuDb.table(table).toArray();
  await kokuDb.recoverySnapshots.put({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), reason, data });
  const ids = await kokuDb.recoverySnapshots.orderBy("createdAt").reverse().offset(3).primaryKeys();
  await kokuDb.recoverySnapshots.bulkDelete(ids);
}

export async function restoreBackup(input: unknown) {
  const backup = parseBackup(input);
  await kokuDb.transaction("rw", kokuDb.tables, async () => {
    await captureRecovery("Before backup restore");
    for (const table of BACKUP_TABLES) {
      const rows = backup.data[table];
      if (!rows) continue;
      if (table === "settings") {
        await kokuDb.settings.filter((row) => isPortableSetting(row.key)).delete();
      } else await kokuDb.table(table).clear();
      if (rows.length) await kokuDb.table(table).bulkPut(rows);
      await kokuDb.pendingUpserts.where("table").equals(table).delete();
      await kokuDb.pendingDeletes.where("table").equals(table).delete();
    }
    await kokuDb.storageMeta.put({ key: "syncPaused", value: true });
    await kokuDb.storageMeta.put({ key: "restoredAt", value: new Date().toISOString() });
    if (backup.timerState) await kokuDb.storageMeta.put({ key: "recoveredTimerState", value: { state: backup.timerState, capturedAt: backup.exportedAt } });
  });
}
