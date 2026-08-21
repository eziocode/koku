import { createTimerId } from "@/lib/stores/timer-math";
import type { ActiveBreak, ActiveTimer } from "@/lib/stores/timer-types";

/**
 * Persisted-state normalisation and migration for the timer store.
 *
 * This is the highest blast-radius code in the timer feature: zustand treats a
 * throwing `migrate` as unrecoverable and falls back to the store's initial
 * state, which would silently discard a user's in-flight timers. So nothing here
 * may throw, and every unknown shape degrades to "keep whatever timers we could
 * recover" rather than to empty.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" || value === null ? value : null;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function normalizeStoredTimer(value: unknown): ActiveTimer | null {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.startTime !== "string") {
    return null;
  }

  return {
    id: typeof value.id === "string" ? value.id : createTimerId(),
    title: value.title,
    projectId: asNullableString(value.projectId),
    categoryId: asNullableString(value.categoryId),
    tags: Array.isArray(value.tags)
      ? (value.tags as unknown[]).filter((tag): tag is string => typeof tag === "string")
      : [],
    notes: asNullableString(value.notes),
    startTime: value.startTime,
    elapsedBeforePauseSec:
      typeof value.elapsedBeforePauseSec === "number" ? value.elapsedBeforePauseSec : 0,
    pausedAt: asNullableString(value.pausedAt),
    pomodoroMode: typeof value.pomodoroMode === "boolean" ? value.pomodoroMode : false,
    parentTimerId: asOptionalString(value.parentTimerId),
  };
}

/**
 * Recovers the timer list from any persisted shape we have ever written.
 *
 * Deliberately version-agnostic: it handles both the current `timers` array and
 * the original single `activeTimer` object by inspecting the data, so a wrong or
 * missing `version` can never cost a user their running timer.
 */
export function migrateTimers(persistedState: unknown): ActiveTimer[] {
  if (!isRecord(persistedState)) {
    return [];
  }

  if (Array.isArray(persistedState.timers)) {
    return persistedState.timers
      .map(normalizeStoredTimer)
      .filter((timer): timer is ActiveTimer => timer !== null);
  }

  const legacyTimer = normalizeStoredTimer(persistedState.activeTimer);
  return legacyTimer ? [legacyTimer] : [];
}

/**
 * Recovers an in-progress break, or discards it.
 *
 * Note the deliberate asymmetry with timers: anything even slightly wrong about
 * a break causes it to be dropped, because that is the cheap failure direction.
 * Losing a break costs the user ten minutes of accuracy; keeping a corrupt one
 * could leave their timers paused with no visible way to resume them.
 */
export function normalizeStoredBreak(value: unknown): ActiveBreak | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, label, startedAt, plannedDurationSec } = value;

  if (typeof id !== "string" || typeof label !== "string" || typeof startedAt !== "string") {
    return null;
  }

  if (!Number.isFinite(Date.parse(startedAt))) {
    return null;
  }

  if (typeof plannedDurationSec !== "number" || !Number.isFinite(plannedDurationSec) || plannedDurationSec < 0) {
    return null;
  }

  return {
    id,
    label,
    startedAt,
    plannedDurationSec,
    pausedTimerIds: Array.isArray(value.pausedTimerIds)
      ? (value.pausedTimerIds as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : [],
    notes: asNullableString(value.notes),
    completedAt: asNullableString(value.completedAt),
  };
}

export interface PersistedTimerState {
  timers: ActiveTimer[];
  activeBreak: ActiveBreak | null;
}

/**
 * The persist `migrate` hook.
 *
 * Zustand treats a throwing `migrate` as unrecoverable and falls back to the
 * store's initial state — which here would mean silently discarding a user's
 * running timers. So this cannot throw under any input, and the timer recovery
 * is attempted independently of the break recovery so one cannot take the other
 * down with it.
 */
export function migratePersistedTimerState(persistedState: unknown): PersistedTimerState {
  let timers: ActiveTimer[] = [];
  try {
    timers = migrateTimers(persistedState);
  } catch {
    timers = [];
  }

  let activeBreak: ActiveBreak | null = null;
  try {
    activeBreak = isRecord(persistedState) ? normalizeStoredBreak(persistedState.activeBreak) : null;
  } catch {
    activeBreak = null;
  }

  return { timers, activeBreak };
}
