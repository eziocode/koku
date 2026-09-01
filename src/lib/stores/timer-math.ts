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

export function createTimer(input: TimerStartInput, parentTimerId?: string | null): ActiveTimer {
  return {
    ...input,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    id: createTimerId(),
    originalStartTime: input.startTime,
    elapsedBeforePauseSec: 0,
    pausedAt: null,
    segments: [],
    parentTimerId: parentTimerId ?? null,
  };
}

/** Freezes elapsed at the moment of pause. */
export function pauseTimerInPlace(timer: ActiveTimer, now = Date.now()): ActiveTimer {
  if (timer.pausedAt) {
    return timer;
  }

  return {
    ...timer,
    elapsedBeforePauseSec: getActiveTimerElapsedSec(timer, now),
    pausedAt: new Date(now).toISOString(),
    segments: [...timer.segments, { startAt: timer.startTime, endAt: new Date(now).toISOString() }],
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
    pausedAt: null,
  };
}
