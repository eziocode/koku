"use client";

import { useMemo } from "react";

import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb } from "@/lib/storage/db";
import type { RoutineSeed } from "@/lib/time-tracking/routine-suggestions";
import {
  buildTitleIndex,
  findTitleSuggestion,
  type TitleIndex,
  type TitleSuggestion,
} from "@/lib/time-tracking/title-suggestions";
import { TITLE_DEBOUNCE_MS, TITLE_INDEX_LIMIT } from "@/lib/ui/list-thresholds";

const EMPTY_SEEDS: RoutineSeed[] = [];

/**
 * Bounded, index-backed seed projection shared by title suggestions and
 * routine detection. Deliberately not `useTimeEntries()` (unbounded) — this
 * projects a small seed shape immediately so nothing more than
 * `TITLE_INDEX_LIMIT` rows are ever held, and one live query feeds both
 * features rather than each running its own.
 */
export function useEntrySeeds(): RoutineSeed[] {
  return useLiveQuery(
    async () => {
      const entries = await kokuDb.timeEntries.orderBy("startAt").reverse().limit(TITLE_INDEX_LIMIT).toArray();
      return entries.map((entry) => ({
        title: entry.title,
        projectId: entry.projectId ?? null,
        categoryId: entry.categoryId ?? null,
        taskId: entry.taskId ?? null,
        tags: entry.tags,
        at: entry.startAt,
        durationSec: entry.durationSec ?? null,
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
  const seeds = useEntrySeeds();
  const index: TitleIndex = useMemo(() => buildTitleIndex(seeds), [seeds]);
  const debouncedTitle = useDebouncedValue(title, TITLE_DEBOUNCE_MS);

  return useMemo(() => findTitleSuggestion(index, debouncedTitle), [index, debouncedTitle]);
}
