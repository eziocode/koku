import { kokuDb, type Category, type Project, type TimeEntry } from "@/lib/storage/db";
import { syncRow } from "@/lib/sync/sync-engine";

/**
 * Framework-free time-entry writes.
 *
 * Extracted from `useTimeEntries` so callers that are not React components — the
 * break runner, the mini player's stop button, notification-driven quick notes —
 * can persist an entry without mounting a hook. Verified safe to lift: the
 * original closure did not reference the hook's `filters`.
 */

export interface CreateTimeEntryInput {
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
  tags: string[];
  notes?: string | null;
}

export function getDurationSec(startAt: string, endAt?: string | null): number | null {
  if (!endAt) {
    return null;
  }

  return Math.max(0, Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 1000));
}

/** Return shared system category, creating it on first break log. */
export async function ensureCategory(name: string, color = "#8b5cf6"): Promise<Category> {
  const existing = await kokuDb.categories.where("name").equals(name).first();
  if (existing) return existing;

  const category: Category = {
    id: name === "Break" ? "system-break" : crypto.randomUUID(),
    name,
    color,
    createdAt: new Date().toISOString(),
  };

  try {
    await kokuDb.categories.add(category);
    void syncRow("categories", category);
    return category;
  } catch {
    // Another tab may have created same category concurrently.
    const concurrent = await kokuDb.categories.where("name").equals(name).first();
    if (concurrent) return concurrent;
    throw new Error(`Unable to create category: ${name}`);
  }
}

/** Return shared system project, creating it on first break log. */
export async function ensureProject(name: string, color = "#8b5cf6"): Promise<Project> {
  const existing = await kokuDb.projects.filter((project) => project.name === name).first();
  if (existing) return existing;

  const project: Project = {
    id: name === "Break" ? "system-break" : crypto.randomUUID(),
    name,
    color,
    hourlyRate: null,
    createdAt: new Date().toISOString(),
  };

  try {
    await kokuDb.projects.add(project);
    void syncRow("projects", project);
    return project;
  } catch {
    // Another tab may have created same project concurrently.
    const concurrent = await kokuDb.projects.filter((item) => item.name === name).first();
    if (concurrent) return concurrent;
    throw new Error(`Unable to create project: ${name}`);
  }
}

/** Return IDs used by every automatically logged break. */
export async function ensureBreakAssignments(): Promise<{
  projectId: string;
  categoryId: string;
}> {
  const [project, category] = await Promise.all([
    ensureProject("Break"),
    ensureCategory("Break"),
  ]);

  return { projectId: project.id, categoryId: category.id };
}

export async function createTimeEntry(data: CreateTimeEntryInput): Promise<TimeEntry> {
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    title: data.title,
    projectId: data.projectId ?? null,
    categoryId: data.categoryId ?? null,
    startAt: data.startAt,
    endAt: data.endAt ?? null,
    durationSec: data.durationSec ?? getDurationSec(data.startAt, data.endAt),
    tags: data.tags,
    notes: data.notes ?? null,
    createdAt: new Date().toISOString(),
  };

  await kokuDb.timeEntries.add(entry);
  void syncRow("timeEntries", entry);
  return entry;
}
