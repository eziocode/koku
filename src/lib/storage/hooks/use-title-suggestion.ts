"use client";

import { useMemo } from "react";

import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb } from "@/lib/storage/db";
import {
  buildTitleIndex,
  findTitleSuggestion,
  type TitleIndex,
  type TitleSeed,
  type TitleSuggestion,
} from "@/lib/time-tracking/title-suggestions";
import { TITLE_DEBOUNCE_MS, TITLE_INDEX_LIMIT } from "@/lib/ui/list-thresholds";

const EMPTY_SEEDS: TitleSeed[] = [];

/**
 * Bounded, index-backed title suggestions. Deliberately not `useTimeEntries()`
 * (unbounded) — this projects a small seed shape immediately so nothing more
 * than `TITLE_INDEX_LIMIT` rows are ever held.
 */
function useTitleSeeds(): TitleSeed[] {
  return useLiveQuery(
    async () => {
      const entries = await kokuDb.timeEntries.orderBy("startAt").reverse().limit(TITLE_INDEX_LIMIT).toArray();
      return entries.map((entry) => ({
        title: entry.title,
        projectId: entry.projectId ?? null,
        categoryId: entry.categoryId ?? null,
        tags: entry.tags,
        at: entry.startAt,
      }));
    },
    [],
    EMPTY_SEEDS,
  );
}

/**
 * The fuzzy pass (candidate cap + length band) runs off the keystroke path via
 * a debounce — load-bearing for keeping typing responsive.
 */
export function useTitleSuggestion(title: string): TitleSuggestion | null {
  const seeds = useTitleSeeds();
  const index: TitleIndex = useMemo(() => buildTitleIndex(seeds), [seeds]);
  const debouncedTitle = useDebouncedValue(title, TITLE_DEBOUNCE_MS);

  return useMemo(() => findTitleSuggestion(index, debouncedTitle), [index, debouncedTitle]);
}
