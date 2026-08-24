function tryParse<T>(str: string | undefined | null, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

export const TABLE_CONFIG = {
  timeEntries: {
    table: "time_entries_koku",
    toFields: (r: Record<string, unknown>) => ({ title: r.title ?? "", project_id: r.projectId ?? null, category_id: r.categoryId ?? null, start_at: r.startAt ?? "", end_at: r.endAt ?? null, duration_sec: r.durationSec ?? null, tags: JSON.stringify(r.tags ?? []), notes: r.notes ?? null, created_at: r.createdAt ?? "" }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.time_entries_koku ?? r) as Record<string, unknown>; return { id: d.id, title: d.title, projectId: d.project_id || null, categoryId: d.category_id || null, startAt: d.start_at || null, endAt: d.end_at || null, durationSec: d.duration_sec === null || d.duration_sec === undefined || d.duration_sec === "" ? null : Number(d.duration_sec), tags: tryParse(d.tags as string, []), notes: d.notes || null, createdAt: d.created_at }; },
    sinceField: "created_at",
  },
  projects: {
    table: "projects_koku",
    toFields: (r: Record<string, unknown>) => ({ name: r.name ?? "", color: r.color ?? "#888888", hourly_rate: r.hourlyRate ?? null, created_at: r.createdAt ?? "" }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.projects_koku ?? r) as Record<string, unknown>; return { id: d.id, name: d.name, color: d.color, hourlyRate: d.hourly_rate === null || d.hourly_rate === undefined || d.hourly_rate === "" ? null : parseFloat(d.hourly_rate as string), createdAt: d.created_at }; },
    sinceField: "created_at",
  },
  categories: {
    table: "categories_koku",
    toFields: (r: Record<string, unknown>) => ({ name: r.name ?? "", color: r.color ?? "#888888", created_at: r.createdAt ?? "" }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.categories_koku ?? r) as Record<string, unknown>; return { id: d.id, name: d.name, color: d.color, createdAt: d.created_at }; },
    sinceField: "created_at",
  },
  notes: {
    table: "notes_koku",
    toFields: (r: Record<string, unknown>) => ({ title: r.title ?? "", slug: r.slug ?? "", content: JSON.stringify(r.content ?? null), tags: JSON.stringify(r.tags ?? []), created_at: r.createdAt ?? "", updated_at: r.updatedAt ?? "" }),
    fromRow: (r: Record<string, unknown>) => { const d = (r.notes_koku ?? r) as Record<string, unknown>; return { id: d.id, title: d.title, slug: d.slug, content: tryParse(d.content as string, null), tags: tryParse(d.tags as string, []), createdAt: d.created_at, updatedAt: d.updated_at }; },
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
  projects: ["id", "name", "color", "createdAt"],
  categories: ["id", "name", "color", "createdAt"],
  notes: ["id", "title", "slug", "createdAt", "updatedAt"],
  noteLinks: ["id", "sourceNoteId", "targetNoteId"],
  settings: ["key"],
};

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

  const id = String(row.id ?? row.key);
  return { ok: true, id, row };
}
