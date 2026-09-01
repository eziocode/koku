"use client";

import { useMemo } from "react";

import { useEntrySeeds } from "@/lib/storage/hooks/use-title-suggestion";
import { useMinuteTick } from "@/lib/stores/use-ticker";
import { buildRoutines, dueRoutines, type RoutineSuggestion } from "@/lib/time-tracking/routine-suggestions";

/**
 * Routines whose time-of-day window currently contains "now", most frequent
 * first. `runningTitles` excludes routines already being tracked, so a
 * standup you just started doesn't also show up as a suggestion to start it.
 */
export function useRoutineSuggestions(runningTitles: string[], limit = 3): RoutineSuggestion[] {
  const seeds = useEntrySeeds();
  const minuteTick = useMinuteTick();

  const routines = useMemo(() => buildRoutines(seeds), [seeds]);
  const runningKey = runningTitles.join(" ");

  return useMemo(
    () => dueRoutines(routines, minuteTick * 60_000, { limit, runningTitles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `runningKey`, a stable string, since `runningTitles` is a fresh array each render.
    [routines, minuteTick, limit, runningKey],
  );
}
