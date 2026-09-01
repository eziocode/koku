import { normalizeText } from "@/lib/search/match";
import { tagsByMajority, type TitleSeed } from "@/lib/time-tracking/title-suggestions";

/** A `TitleSeed` widened with the fields a routine needs but a title suggestion doesn't. */
export interface RoutineSeed extends TitleSeed {
  taskId: string | null;
  durationSec: number | null;
}

export interface RoutineSuggestion {
  /** Normalized title — stable identity across `buildRoutines` calls. */
  key: string;
  title: string;
  projectId: string | null;
  categoryId: string | null;
  taskId: string | null;
  tags: string[];
  count: number;
  /** Minute-of-day (0-1439, local time) the occurrences cluster around. */
  centreMinute: number;
  lastAt: string;
  avgDurationSec: number | null;
}

const MINUTES_PER_DAY = 1440;
/** How far (in minutes-of-day) an occurrence may sit from the cluster centre and still count. */
export const ROUTINE_WINDOW_MIN = 45;
/** Occurrences required before a title counts as a routine at all. */
export const ROUTINE_MIN_OCCURRENCES = 3;

interface Occurrence {
  seed: RoutineSeed;
  minute: number;
}

function minuteOfDay(when: string | number): number {
  const date = new Date(when);
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Mean of minute-of-day values on a 24h clock. A plain arithmetic mean would
 * put a 23:50/00:10 routine at midday; averaging unit vectors around the
 * clock face and reading back the angle keeps it near midnight instead.
 */
function circularMeanMinute(minutes: number[]): number {
  let sinSum = 0;
  let cosSum = 0;
  for (const minute of minutes) {
    const angle = (minute / MINUTES_PER_DAY) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }
  const angle = Math.atan2(sinSum / minutes.length, cosSum / minutes.length);
  const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
  return (normalizedAngle / (2 * Math.PI)) * MINUTES_PER_DAY;
}

/** Shortest distance between two minute-of-day values, wrapping across midnight. */
export function circularMinuteDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(diff, MINUTES_PER_DAY - diff);
}

/**
 * Clusters seeds by normalized title, then by time-of-day: within each title
 * group, keeps only the occurrences within `ROUTINE_WINDOW_MIN` of the
 * group's circular-mean minute (recomputed once after the first pass, since
 * an outlier can pull the initial mean away from where most occurrences
 * actually sit) and requires `ROUTINE_MIN_OCCURRENCES` survivors.
 */
export function buildRoutines(seeds: RoutineSeed[]): RoutineSuggestion[] {
  const byTitle = new Map<string, Occurrence[]>();

  for (const seed of seeds) {
    const key = normalizeText(seed.title);
    if (!key) {
      continue;
    }
    const minute = minuteOfDay(seed.at);
    const list = byTitle.get(key);
    if (list) {
      list.push({ seed, minute });
    } else {
      byTitle.set(key, [{ seed, minute }]);
    }
  }

  const routines: RoutineSuggestion[] = [];

  for (const [key, occurrences] of byTitle) {
    if (occurrences.length < ROUTINE_MIN_OCCURRENCES) {
      continue;
    }

    const roughCentre = circularMeanMinute(occurrences.map((o) => o.minute));
    const clustered = occurrences.filter(
      (o) => circularMinuteDistance(o.minute, roughCentre) <= ROUTINE_WINDOW_MIN,
    );

    if (clustered.length < ROUTINE_MIN_OCCURRENCES) {
      continue;
    }

    const centreMinute = circularMeanMinute(clustered.map((o) => o.minute));
    const mostRecent = clustered.reduce((latest, current) =>
      Date.parse(current.seed.at) > Date.parse(latest.seed.at) ? current : latest,
    );

    const tagCounts = new Map<string, number>();
    let durationTotal = 0;
    let durationCount = 0;
    for (const { seed } of clustered) {
      for (const tag of seed.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      if (seed.durationSec != null) {
        durationTotal += seed.durationSec;
        durationCount += 1;
      }
    }

    routines.push({
      key,
      title: mostRecent.seed.title,
      projectId: mostRecent.seed.projectId,
      categoryId: mostRecent.seed.categoryId,
      taskId: mostRecent.seed.taskId,
      tags: tagsByMajority(tagCounts, clustered.length),
      count: clustered.length,
      centreMinute,
      lastAt: mostRecent.seed.at,
      avgDurationSec: durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
    });
  }

  return routines;
}

/**
 * Routines whose time-of-day window currently contains `nowMs`, most
 * frequent first (ties broken by most recently seen), excluding any routine
 * whose title matches one of `runningTitles` — no point suggesting a start
 * for work already being tracked.
 */
export function dueRoutines(
  routines: RoutineSuggestion[],
  nowMs: number,
  options: { limit?: number; runningTitles?: string[] } = {},
): RoutineSuggestion[] {
  const { limit = 3, runningTitles = [] } = options;
  const runningKeys = new Set(runningTitles.map(normalizeText));
  const nowMinute = minuteOfDay(nowMs);

  return routines
    .filter((routine) => !runningKeys.has(routine.key))
    .filter((routine) => circularMinuteDistance(routine.centreMinute, nowMinute) <= ROUTINE_WINDOW_MIN)
    .sort((a, b) => b.count - a.count || Date.parse(b.lastAt) - Date.parse(a.lastAt))
    .slice(0, limit);
}

/**
 * The most-used routines overall, regardless of time of day — unlike
 * `dueRoutines`, which only surfaces one whose window contains `nowMs`. Same
 * frequency-first ordering and `runningTitles` exclusion.
 */
export function mostUsedRoutines(
  routines: RoutineSuggestion[],
  options: { limit?: number; runningTitles?: string[] } = {},
): RoutineSuggestion[] {
  const { limit = 5, runningTitles = [] } = options;
  const runningKeys = new Set(runningTitles.map(normalizeText));

  return routines
    .filter((routine) => !runningKeys.has(routine.key))
    .sort((a, b) => b.count - a.count || Date.parse(b.lastAt) - Date.parse(a.lastAt))
    .slice(0, limit);
}
