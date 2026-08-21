import { getBreakRemainingSec } from "@/lib/breaks/break-math";
import type { CheckInContext } from "@/lib/notifications/payload";
import { getActiveTimerElapsedSec } from "@/lib/stores/timer-math";
import type { ActiveBreak, ActiveTimer } from "@/lib/stores/timer-types";

/**
 * Turns current app state into the thing a check-in should talk about.
 *
 * Pure, so "what would the notification say right now" is testable without a
 * browser. Precedence is break > running timer > paused timer > idle: a break is
 * the most specific truth about what the user is doing, and a running timer is
 * more relevant than a paused one.
 */
export function deriveCheckInContext(
  timers: ActiveTimer[],
  activeBreak: ActiveBreak | null,
  lastEntryTitle: string | null,
  now = Date.now(),
): CheckInContext {
  if (activeBreak && !activeBreak.completedAt) {
    return {
      kind: "break",
      breakId: activeBreak.id,
      label: activeBreak.label,
      remainingSec: getBreakRemainingSec(activeBreak, now),
    };
  }

  // Prefer the primary timer, then any running one, so a check-in during a
  // parallel "pause timer" session still names the work the user thinks of first.
  const running = timers.filter((timer) => !timer.pausedAt);
  const chosenRunning = running.find((timer) => !timer.parentTimerId) ?? running[0];

  if (chosenRunning) {
    return {
      kind: "timer-running",
      timerId: chosenRunning.id,
      title: chosenRunning.title,
      elapsedSec: getActiveTimerElapsedSec(chosenRunning, now),
    };
  }

  const paused = timers.find((timer) => !timer.parentTimerId) ?? timers[0];
  if (paused) {
    return {
      kind: "timer-paused",
      timerId: paused.id,
      title: paused.title,
      elapsedSec: getActiveTimerElapsedSec(paused, now),
    };
  }

  return { kind: "idle", lastEntryTitle, idleForSec: null };
}
