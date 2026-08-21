/**
 * Check-in scheduling arithmetic.
 *
 * The scheduler does not hold a `setTimeout` to the next fire. Instead it
 * persists an absolute `nextFireAt` and a coarse checker asks "is it due yet?".
 * That is what makes it immune to drift, to background-tab throttling (hidden
 * tabs get clamped to roughly one wake per minute), and to the tab being frozen
 * or discarded entirely: whenever it next runs, the answer is still correct.
 */

export interface ScheduleState {
  /** Epoch ms of the next due check-in; `null` before initialisation. */
  nextFireAt: number | null;
  lastFiredAt: number | null;
}

export type ScheduleReason =
  | "uninitialised"
  | "not-due"
  | "due"
  | "suppressed"
  | "stale-wake";

export interface ScheduleDecision {
  fire: boolean;
  reason: ScheduleReason;
  next: ScheduleState;
}

export interface EvaluateOptions {
  /** DND or quiet hours. Suppressed check-ins are dropped, never queued. */
  suppressed: boolean;
  /** Overdue by more than this many intervals counts as a stale wake. */
  staleFactor?: number;
}

export const DEFAULT_STALE_FACTOR = 2;

export function computeInitialSchedule(now: number, intervalMinutes: number): ScheduleState {
  return { nextFireAt: now + intervalMinutes * 60_000, lastFiredAt: null };
}

/** Re-anchors the next fire after the interval setting changes mid-flight. */
export function reanchorSchedule(
  state: ScheduleState,
  now: number,
  intervalMinutes: number,
): ScheduleState {
  return { ...state, nextFireAt: now + intervalMinutes * 60_000 };
}

export function evaluateSchedule(
  state: ScheduleState,
  now: number,
  intervalMinutes: number,
  options: EvaluateOptions,
): ScheduleDecision {
  const intervalMs = intervalMinutes * 60_000;
  const staleFactor = options.staleFactor ?? DEFAULT_STALE_FACTOR;

  if (state.nextFireAt === null) {
    return {
      fire: false,
      reason: "uninitialised",
      next: computeInitialSchedule(now, intervalMinutes),
    };
  }

  if (now < state.nextFireAt) {
    return { fire: false, reason: "not-due", next: state };
  }

  // Woken long after the fact — a closed lid, a frozen tab, a discarded process.
  // Firing here would show a nag about work from hours ago that the user cannot
  // act on, so skip exactly one and resume the cadence. Never a burst of catch-up
  // notifications, because the next fire is anchored forward from `now`.
  if (now - state.nextFireAt > staleFactor * intervalMs) {
    return {
      fire: false,
      reason: "stale-wake",
      next: { ...state, nextFireAt: now + intervalMs },
    };
  }

  if (options.suppressed) {
    return {
      fire: false,
      reason: "suppressed",
      next: { ...state, nextFireAt: now + intervalMs },
    };
  }

  // Anchored to the actual fire time rather than to the missed grid slot, so a
  // checker that runs late can never accumulate a backlog to work through.
  return {
    fire: true,
    reason: "due",
    next: { nextFireAt: now + intervalMs, lastFiredAt: now },
  };
}
