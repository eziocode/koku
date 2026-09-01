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

/** The unconfigured "just start tracking" action used by the command palette and the `t` shortcut. */
export function startQuickTimer(deps: QuickTimerDeps): QuickTimerResult {
  return startGuardedTimer(deps, {
    title: "Quick focus",
    startTime: new Date().toISOString(),
    projectId: null,
    categoryId: null,
    pomodoroMode: false,
  });
}
