import type { CategoryLookup, ProjectLookup } from "@/lib/charts/segments";

/**
 * Minimal entry shape these aggregations need. Both a Dexie `TimeEntry` and a
 * `SegmentSourceEntry` (what `adminRowsToSegmentEntries` produces) satisfy it,
 * so the tag page and the admin user detail share one implementation.
 */
export interface TagStatsEntry {
  startAt: string;
  durationSec?: number | null;
  projectId?: string | null;
  categoryId?: string | null;
  tags: string[];
}

export interface TagProjectSlice {
  id: string;
  name: string;
  color: string;
  sec: number;
}

export interface TagCategorySlice {
  id: string;
  name: string;
  sec: number;
}

export interface TagStats {
  /** The normalized tag these stats describe. */
  tag: string;
  entryCount: number;
  totalSec: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byProject: TagProjectSlice[];
  byCategory: TagCategorySlice[];
  /** Tags that appear alongside this one, most frequent first. */
  coTags: Array<[string, number]>;
}

export interface BuildTagStatsOptions {
  projectMap: ProjectLookup;
  categoryMap?: CategoryLookup;
  /** How many co-occurring tags to keep. Defaults to 12. */
  coTagLimit?: number;
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * All-time stats for a single tag: total time, when it was first and last used,
 * how it splits across projects and categories, and what it tends to be paired
 * with. `entries` must already be filtered to the tag.
 */
export function buildTagStats(
  tag: string,
  entries: TagStatsEntry[],
  { projectMap, categoryMap, coTagLimit = 12 }: BuildTagStatsOptions,
): TagStats {
  const normalizedTag = normalizeTag(tag);
  const totalSec = entries.reduce((sum, entry) => sum + (entry.durationSec ?? 0), 0);
  const sortedByDate = [...entries].sort((a, b) => a.startAt.localeCompare(b.startAt));

  const byProject = new Map<string, TagProjectSlice>();
  const byCategory = new Map<string, TagCategorySlice>();
  const coTags = new Map<string, number>();

  for (const entry of entries) {
    const sec = entry.durationSec ?? 0;

    if (entry.projectId) {
      const project = projectMap.get(entry.projectId);
      const existing = byProject.get(entry.projectId) ?? {
        id: entry.projectId,
        name: project?.name ?? "Unknown",
        color: project?.color ?? "#888",
        sec: 0,
      };
      existing.sec += sec;
      byProject.set(entry.projectId, existing);
    }

    if (entry.categoryId) {
      const category = categoryMap?.get(entry.categoryId);
      const existing = byCategory.get(entry.categoryId) ?? {
        id: entry.categoryId,
        name: category?.name ?? "Unknown",
        sec: 0,
      };
      existing.sec += sec;
      byCategory.set(entry.categoryId, existing);
    }

    for (const other of entry.tags ?? []) {
      const norm = normalizeTag(other);
      if (!norm || norm === normalizedTag) continue;
      coTags.set(norm, (coTags.get(norm) ?? 0) + 1);
    }
  }

  return {
    tag: normalizedTag,
    entryCount: entries.length,
    totalSec,
    firstSeen: sortedByDate[0]?.startAt ?? null,
    lastSeen: sortedByDate[sortedByDate.length - 1]?.startAt ?? null,
    byProject: [...byProject.values()].sort((a, b) => b.sec - a.sec),
    byCategory: [...byCategory.values()].sort((a, b) => b.sec - a.sec),
    coTags: [...coTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, coTagLimit),
  };
}

export interface TagTotal {
  tag: string;
  seconds: number;
  count: number;
}

/**
 * Every tag across a set of entries, ranked by tracked time. Unlike
 * `buildTagStats` this takes an unfiltered set and answers "what is this person
 * spending time on", which is what the admin time tab needs.
 */
export function buildTagTotals(entries: TagStatsEntry[], limit?: number): TagTotal[] {
  const totals = new Map<string, TagTotal>();

  for (const entry of entries) {
    const sec = entry.durationSec ?? 0;
    // A tag repeated on one entry must not count that entry's time twice.
    const seen = new Set<string>();

    for (const raw of entry.tags ?? []) {
      const tag = normalizeTag(raw);
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);

      const existing = totals.get(tag) ?? { tag, seconds: 0, count: 0 };
      existing.seconds += sec;
      existing.count += 1;
      totals.set(tag, existing);
    }
  }

  const ranked = [...totals.values()].sort(
    (a, b) => b.seconds - a.seconds || b.count - a.count || a.tag.localeCompare(b.tag),
  );

  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}
