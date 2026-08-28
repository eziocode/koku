"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb } from "@/lib/storage/db";
import { TAG_MAX_SUGGESTIONS, TAG_SCAN_LIMIT } from "@/lib/ui/list-thresholds";

const EMPTY_TAGS: string[] = [];

/**
 * Recency-weighted score so a tag used yesterday outranks one used a year
 * ago, even if the old one has more total uses.
 */
function scoreTags(taggedItems: Array<{ tags: string[]; at: string }>, now: number): Map<string, number> {
  const scores = new Map<string, number>();

  for (const item of taggedItems) {
    const at = Date.parse(item.at);
    const ageDays = Number.isFinite(at) ? Math.max(0, (now - at) / (1000 * 60 * 60 * 24)) : 365;
    const weight = 1 / (1 + ageDays / 30);

    for (const tag of item.tags) {
      scores.set(tag, (scores.get(tag) ?? 0) + weight);
    }
  }

  return scores;
}

/**
 * Bounded, index-backed tag suggestions — replaces the unbounded full-table
 * `useTimeEntries()` reads that used to derive this list on every write.
 */
export function useTagSuggestions(): string[] {
  return useLiveQuery(
    async () => {
      const [entries, tasks] = await Promise.all([
        kokuDb.timeEntries.orderBy("startAt").reverse().limit(TAG_SCAN_LIMIT).toArray(),
        kokuDb.tasks.orderBy("createdAt").reverse().limit(TAG_SCAN_LIMIT).toArray(),
      ]);

      const now = Date.now();
      const scores = scoreTags(
        [
          ...entries.map((entry) => ({ tags: entry.tags, at: entry.startAt })),
          ...tasks.map((task) => ({ tags: task.tags, at: task.createdAt })),
        ],
        now,
      );

      return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TAG_MAX_SUGGESTIONS)
        .map(([tag]) => tag);
    },
    [],
    EMPTY_TAGS,
  );
}
