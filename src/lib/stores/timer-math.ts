import type { ActiveTimer, LegacyActiveTimer, TimerStartInput } from "@/lib/stores/timer-types";

/**
 * Pure timer arithmetic.
 *
 * Everything here derives from timestamps and an injected `now`. Nothing
 * accumulates ticks, which is what makes elapsed values correct after the tab
 * has been backgrounded, throttled, frozen, or asleep for hours.
 */

export function parseTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function createTimerId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `timer-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function getActiveTimerElapsedSec(
  timer: ActiveTimer | LegacyActiveTimer,
  now = Date.now(),
): number {
  if (timer.pausedAt) {
    return Math.max(0, timer.elapsedBeforePauseSec);
  }

  const startMs = parseTimestamp(timer.startTime);
  if (startMs === null) {
    return Math.max(0, timer.elapsedBeforePauseSec);
  }

  return Math.max(timer.elapsedBeforePauseSec, Math.floor((now - startMs) / 1000));
}

/**
 * Seconds left of a timer's planned duration, or `null` when it is open ended.
 *
 * Derived from the stored timestamps via `getActiveTimerElapsedSec`, so pause
 * time is excluded for free and a frozen tab renders late rather than measuring
 * wrong. Clamped at zero: past the planned end this reads `0` and
 * `isTimerOverdue` takes over.
 */
export function getTimerRemainingSec(timer: ActiveTimer, now = Date.now()): number | null {
  if (!timer.plannedDurationSec) return null;
  return Math.max(0, timer.plannedDurationSec - getActiveTimerElapsedSec(timer, now));
}

/** True once a timer with a planned duration has run past it. Always false for an open-ended one. */
export function isTimerOverdue(timer: ActiveTimer, now = Date.now()): boolean {
  if (!timer.plannedDurationSec) return false;
  return getActiveTimerElapsedSec(timer, now) >= timer.plannedDurationSec;
}

export function createTimer(input: TimerStartInput, parentTimerId?: string | null): ActiveTimer {
  return {
    ...input,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    id: createTimerId(),
    originalStartTime: input.startTime,
    runStartedAt: input.startTime,
    elapsedBeforePauseSec: 0,
    pausedAt: null,
    segments: [],
    parentTimerId: parentTimerId ?? null,
  };
}

/**
 * Freezes elapsed at the moment of pause.
 *
 * The closed run is recorded from `runStartedAt`, not `startTime`: after a
 * previous resume, `startTime` has already been shifted forward and no longer
 * marks where this run actually began — using it here is what made a resumed
 * run's recorded start land earlier than it happened, overlapping whatever
 * parallel task filled the pause. `runStartedAt` is left untouched (not
 * nulled) so a timer paused again without an intervening resume — there is no
 * such path today, but a future one — still has a value to fall back to.
 */
export function pauseTimerInPlace(timer: ActiveTimer, now = Date.now()): ActiveTimer {
  if (timer.pausedAt) {
    return timer;
  }

  return {
    ...timer,
    elapsedBeforePauseSec: getActiveTimerElapsedSec(timer, now),
    pausedAt: new Date(now).toISOString(),
    segments: [
      ...timer.segments,
      { startAt: timer.runStartedAt ?? timer.startTime, endAt: new Date(now).toISOString() },
    ],
  };
}

/**
 * Resumes by advancing `startTime` past the paused interval.
 *
 * This is why break time is excluded from work time for free, and why it stays
 * correct even if the tab was closed for the entire break: the shift is computed
 * from the two stored timestamps, not from anything that had to be running.
 */
export function resumePausedTimer(timer: ActiveTimer, now = Date.now()): ActiveTimer {
  if (!timer.pausedAt) {
    return timer;
  }

  const pausedAtMs = parseTimestamp(timer.pausedAt);
  const pausedDelta = pausedAtMs === null ? 0 : Math.max(0, Math.floor((now - pausedAtMs) / 1000));
  const startMs = parseTimestamp(timer.startTime) ?? now;

  return {
    ...timer,
    startTime: new Date(startMs + pausedDelta * 1000).toISOString(),
    // The new run starts now, for real — this is what `pauseTimerInPlace`
    // records next, instead of the shifted `startTime` above.
    runStartedAt: new Date(now).toISOString(),
    pausedAt: null,
  };
}
