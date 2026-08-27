import { fromCatalystDateTime, toCatalystDateTime } from "@/lib/db/catalyst-datetime";

/** `null`-safe `toCatalystDateTime` — same ternary the existing `endAt` fields use. */
function nullableDateTime(value: unknown): string | null {
  return value === null || value === undefined ? null : toCatalystDateTime(value);
}

function tryParse<T>(str: string | undefined | null, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

export const TABLE_CONFIG = {
  timeEntries: {
    table: "time_entries_koku",
    toFields: (r: Record<string, unknown>) => ({ title: r.title ?? "", project_id: r.projectId ?? null, category_id: r.categoryId ?? null, task_id: r.taskId ?? null, start_at: toCatalystDateTime(r.startAt), end_at: r.endAt === null || r.endAt === undefined ? null : toCatalystDateTime(r.endAt), duration_sec: r.durationSec ?? null, tags: JSON.stringify(r.tags ?? []), notes: r.notes ?? null, created_at: toCatalystDateTime(r.createdAt) }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.time_entries_koku ?? r) as Record<string, unknown>; return { id: d.id, title: d.title, projectId: d.project_id || null, categoryId: d.category_id || null, taskId: d.task_id || null, startAt: d.start_at || null, endAt: d.end_at || null, durationSec: d.duration_sec === null || d.duration_sec === undefined || d.duration_sec === "" ? null : Number(d.duration_sec), tags: tryParse(d.tags as string, []), notes: d.notes || null, createdAt: d.created_at }; },
    sinceField: "created_at",
  },
  tasks: {
    table: "tasks_koku",
    toFields: (r: Record<string, unknown>) => ({
      title: r.title ?? "",
      notes: r.notes ?? null,
      status: r.status ?? "open",
      priority_level: r.priority ?? "medium",
      due_at: nullableDateTime(r.dueAt),
      start_at: nullableDateTime(r.startAt),
      project_id: r.projectId ?? null,
      category_id: r.categoryId ?? null,
      tags: JSON.stringify(r.tags ?? []),
      completed_at: nullableDateTime(r.completedAt),
      reopened_at: nullableDateTime(r.reopenedAt),
      sort_order: r.sortOrder ?? 0,
      created_at: toCatalystDateTime(r.createdAt),
      updated_at: toCatalystDateTime(r.updatedAt),
    }),
    fromRow: (r: Record<string, unknown>) => {
      const d = (r.tasks_koku ?? r) as Record<string, unknown>;
      return {
        id: d.id,
        title: d.title,
        notes: d.notes || null,
        status: (d.status as string) || "open",
        priority: (d.priority_level as string) || "medium",
        // Normalized (unlike most `fromRow`s, which pass Catalyst's
        // "YYYY-MM-DD HH:MM:SS" through raw) because `dueAt` is a *string*
        // Dexie index: `' '` sorts before `'T'`, so an un-normalized pulled
        // task would always sort ahead of a local one on the same date.
        dueAt: fromCatalystDateTime(d.due_at),
        startAt: fromCatalystDateTime(d.start_at),
        projectId: d.project_id || null,
        categoryId: d.category_id || null,
        tags: tryParse(d.tags as string, []),
        completedAt: fromCatalystDateTime(d.completed_at),
        reopenedAt: fromCatalystDateTime(d.reopened_at),
        sortOrder: d.sort_order === null || d.sort_order === undefined || d.sort_order === "" ? 0 : Number(d.sort_order),
        createdAt: fromCatalystDateTime(d.created_at) ?? d.created_at,
        updatedAt: fromCatalystDateTime(d.updated_at) ?? d.updated_at,
      };
    },
    sinceField: "updated_at",
  },
  projects: {
    table: "projects_koku",
    toFields: (r: Record<string, unknown>) => ({ name: r.name ?? "", color: r.color ?? "#888888", hourly_rate: r.hourlyRate ?? null, created_at: toCatalystDateTime(r.createdAt) }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.projects_koku ?? r) as Record<string, unknown>; return { id: d.id, name: d.name, color: d.color, hourlyRate: d.hourly_rate === null || d.hourly_rate === undefined || d.hourly_rate === "" ? null : parseFloat(d.hourly_rate as string), createdAt: d.created_at }; },
    sinceField: "created_at",
  },
  categories: {
    table: "categories_koku",
    toFields: (r: Record<string, unknown>) => ({ name: r.name ?? "", color: r.color ?? "#888888", created_at: toCatalystDateTime(r.createdAt) }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.categories_koku ?? r) as Record<string, unknown>; return { id: d.id, name: d.name, color: d.color, createdAt: d.created_at }; },
    sinceField: "created_at",
  },
  notes: {
    table: "notes_koku",
    toFields: (r: Record<string, unknown>) => ({ title: r.title ?? "", slug: r.slug ?? "", content: JSON.stringify(r.content ?? null), tags: JSON.stringify(r.tags ?? []), created_at: toCatalystDateTime(r.createdAt), updated_at: toCatalystDateTime(r.updatedAt) }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.notes_koku ?? r) as Record<string, unknown>; return { id: d.id, title: d.title, slug: d.slug, content: tryParse(d.content as string, null), tags: tryParse(d.tags as string, []), createdAt: d.created_at, updatedAt: d.updated_at }; },
    sinceField: "updated_at",
  },
  personalNotes: {
    table: "personal_notes_koku",
    toFields: (r: Record<string, unknown>) => ({ title: r.title ?? "", slug: r.slug ?? "", content: JSON.stringify(r.content ?? null), tags: JSON.stringify(r.tags ?? []), created_at: toCatalystDateTime(r.createdAt), updated_at: toCatalystDateTime(r.updatedAt) }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.personal_notes_koku ?? r) as Record<string, unknown>; return { id: d.id, title: d.title, slug: d.slug, content: tryParse(d.content as string, null), tags: tryParse(d.tags as string, []), createdAt: d.created_at, updatedAt: d.updated_at }; },
    sinceField: "updated_at",
  },
  noteLinks: {
    table: "note_links_koku",
    toFields: (r: Record<string, unknown>) => ({ source_note_id: r.sourceNoteId ?? "", target_note_id: r.targetNoteId ?? "" }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.note_links_koku ?? r) as Record<string, unknown>; return { id: d.id, sourceNoteId: d.source_note_id, targetNoteId: d.target_note_id }; },
    sinceField: null,
  },
  settings: {
    table: "settings_koku",
    toFields: (r: Record<string, unknown>) => ({ setting_key: r.key ?? "", setting_value: JSON.stringify(r.value ?? null) }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.settings_koku ?? r) as Record<string, unknown>; return { key: d.setting_key, value: tryParse(d.setting_value as string, null) }; },
    sinceField: null,
  },
} as const;

export type TableKey = keyof typeof TABLE_CONFIG;

const REQUIRED_STRING_FIELDS: Record<TableKey, string[]> = {
  timeEntries: ["id", "title", "startAt", "createdAt"],
  tasks: ["id", "title", "status", "priority", "createdAt", "updatedAt"],
  projects: ["id", "name", "color", "createdAt"],
  categories: ["id", "name", "color", "createdAt"],
  notes: ["id", "title", "slug", "createdAt", "updatedAt"],
  personalNotes: ["id", "title", "slug", "createdAt", "updatedAt"],
  noteLinks: ["id", "sourceNoteId", "targetNoteId"],
  settings: ["key"],
};

const DATE_FIELDS: Partial<Record<TableKey, string[]>> = {
  timeEntries: ["startAt", "createdAt"],
  tasks: ["createdAt", "updatedAt"],
  projects: ["createdAt"],
  categories: ["createdAt"],
  notes: ["createdAt", "updatedAt"],
  personalNotes: ["createdAt", "updatedAt"],
};

const TASK_STATUSES = ["open", "in_progress", "paused", "done"];
const TASK_PRIORITIES = ["low", "medium", "high"];
const TASK_NULLABLE_DATE_FIELDS = ["dueAt", "startAt", "completedAt", "reopenedAt"];

export type SyncRowValidation =
  | { ok: true; id: string; row: Record<string, unknown> }
  | { ok: false; error: string };

export function validateSyncRow(table: TableKey, value: unknown): SyncRowValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Row must be an object." };
  }

  const row = value as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS[table]) {
    if (typeof row[field] !== "string" || !row[field].trim()) {
      return { ok: false, error: `${field} must be a non-empty string.` };
    }
  }

  for (const field of DATE_FIELDS[table] ?? []) {
    if (toCatalystDateTime(row[field]) === null) {
      return { ok: false, error: `${field} must be a valid datetime.` };
    }
  }

  if (table === "timeEntries" && row.endAt !== null && row.endAt !== undefined
    && toCatalystDateTime(row.endAt) === null) {
    return { ok: false, error: "endAt must be a valid datetime or null." };
  }

  if (table === "tasks") {
    for (const field of TASK_NULLABLE_DATE_FIELDS) {
      const value = row[field];
      if (value !== null && value !== undefined && toCatalystDateTime(value) === null) {
        return { ok: false, error: `${field} must be a valid datetime or null.` };
      }
    }
    if (!TASK_STATUSES.includes(String(row.status))) {
      return { ok: false, error: "status must be one of open, in_progress, paused, done." };
    }
    if (!TASK_PRIORITIES.includes(String(row.priority))) {
      return { ok: false, error: "priority must be one of low, medium, high." };
    }
    if (typeof row.sortOrder !== "number" || !Number.isFinite(row.sortOrder)) {
      return { ok: false, error: "sortOrder must be a finite number." };
    }
  }

  const id = String(row.id ?? row.key);
  return { ok: true, id, row };
}
