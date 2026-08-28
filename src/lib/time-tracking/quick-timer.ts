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

/**
 * The guarded "start a quick timer" action shared by the command palette and
 * the `t` keyboard shortcut, so the two refusal paths — another timer already
 * running, or an active break with `breaks.blockNewTimers` on — can't drift
 * apart between call sites.
 */
export function startQuickTimer({ timers, activeBreak, blockNewTimers, startTimer }: QuickTimerDeps): QuickTimerResult {
  if (timers.length > 0) {
    return { status: "blocked-running", message: "Stop and save active timers before starting another." };
  }

  if (activeBreak && blockNewTimers) {
    return { status: "blocked-break", message: resolvePeriodCopy(activeBreak).blockedTimerMessage };
  }

  const started = startTimer(
    {
      title: "Quick focus",
      startTime: new Date().toISOString(),
      projectId: null,
      categoryId: null,
      pomodoroMode: false,
    },
    { allowDuringBreak: !blockNewTimers },
  );

  if (!started) {
    return { status: "blocked-running", message: "Stop and save active timers before starting another." };
  }

  return { status: "started", timer: started };
}
