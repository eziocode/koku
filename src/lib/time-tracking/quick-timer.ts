import { resolvePeriodCopy } from "@/lib/breaks/break-copy";
import type { ActiveBreak, ActiveTimer, StartTimerOptions, TimerStartInput } from "@/lib/stores/timer-store";

export type QuickTimerResult =
  | { status: "started"; timer: ActiveTimer }
  | { status: "blocked-running"; message: string }
  | { status: "blocked-break"; message: string };

interface QuickTimerDeps {
  timers: ActiveTimer[];
  activeBreak: ActiveBreak | null;
  blockNewTimers: boolean;
  startTimer: (input: TimerStartInput, options?: StartTimerOptions) => ActiveTimer | null;
}

interface PausingStartDeps extends QuickTimerDeps {
  pauseTimer: (id: string) => void;
  startSecondaryTimer: (parentTimerId: string, input: TimerStartInput) => ActiveTimer | null;
}

const BLOCKED_RUNNING_MESSAGE = "Stop and save active timers before starting another.";

/**
 * The guarded "start a timer" action shared by the command palette, the `t`
 * keyboard shortcut, and the Routines card, so the two refusal paths -
 * another timer already running, or an active break with
 * `breaks.blockNewTimers` on - can't drift apart between call sites.
 */
export function startGuardedTimer(
  { timers, activeBreak, blockNewTimers, startTimer }: QuickTimerDeps,
  input: TimerStartInput,
): QuickTimerResult {
  if (timers.length > 0) {
    return { status: "blocked-running", message: BLOCKED_RUNNING_MESSAGE };
  }

  if (activeBreak && blockNewTimers) {
    return { status: "blocked-break", message: resolvePeriodCopy(activeBreak).blockedTimerMessage };
  }

  const started = startTimer(input, { allowDuringBreak: !blockNewTimers });

  if (!started) {
    return { status: "blocked-running", message: BLOCKED_RUNNING_MESSAGE };
  }

  return { status: "started", timer: started };
}

/**
 * Same guards as `startGuardedTimer`, but instead of refusing when a timer is
 * already running, it pauses every running timer and starts the new one as a
 * secondary timer alongside it — "duplicate this, pause what's running" for
 * cloned entries and routine quick-starts, which want to switch straight into
 * the new work rather than block on the old one.
 */
export function startTimerPausingRunning(
  { timers, activeBreak, blockNewTimers, startTimer, pauseTimer, startSecondaryTimer }: PausingStartDeps,
  input: TimerStartInput,
): QuickTimerResult {
  if (timers.length === 0) {
    return startGuardedTimer({ timers, activeBreak, blockNewTimers, startTimer }, input);
  }

  if (activeBreak && blockNewTimers) {
    return { status: "blocked-break", message: resolvePeriodCopy(activeBreak).blockedTimerMessage };
  }

  for (const timer of timers) {
    if (!timer.pausedAt) {
      pauseTimer(timer.id);
    }
  }

  const started = startSecondaryTimer(timers[0].id, input);

  if (!started) {
    return { status: "blocked-running", message: BLOCKED_RUNNING_MESSAGE };
  }

  return { status: "started", timer: started };
}

export interface QuickTimerOptions {
  /** Whole minutes the user means to focus for. Omit for an open-ended timer. */
  plannedMinutes?: number;
  /** Overrides the default "Quick focus" title. */
  title?: string;
}

/**
 * The barely-configured "just start tracking" action used by the command
 * palette and the `t` shortcut.
 *
 * `options` is defaulted, so the zero-argument open-ended start both existing
 * call sites rely on is preserved by construction rather than by discipline.
 */
export function startQuickTimer(deps: QuickTimerDeps, options: QuickTimerOptions = {}): QuickTimerResult {
  return startGuardedTimer(deps, {
    title: options.title?.trim() || "Quick focus",
    startTime: new Date().toISOString(),
    projectId: null,
    categoryId: null,
    pomodoroMode: false,
    plannedDurationSec: options.plannedMinutes ? options.plannedMinutes * 60 : undefined,
  });
}
