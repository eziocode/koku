import type { ActiveBreak } from "@/lib/stores/timer-types";

/**
 * Pure break arithmetic.
 *
 * Everything derives from `startedAt` plus an injected `now`, never from a
 * decrementing counter. That is what makes a break correct across a reload, a
 * throttled background tab, or a laptop lid closed for the whole break.
 */

function parse(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getBreakElapsedSec(activeBreak: ActiveBreak, now = Date.now()): number {
  const startedAt = parse(activeBreak.startedAt);
  if (startedAt === null) {
    return 0;
  }

  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** `null` for an open-ended break, which has nothing to count down to. */
export function getBreakRemainingSec(activeBreak: ActiveBreak, now = Date.now()): number | null {
  if (activeBreak.plannedDurationSec <= 0) {
    return null;
  }

  return Math.max(0, activeBreak.plannedDurationSec - getBreakElapsedSec(activeBreak, now));
}

export function isBreakComplete(activeBreak: ActiveBreak, now = Date.now()): boolean {
  if (activeBreak.plannedDurationSec <= 0) {
    return false;
  }

  if (parse(activeBreak.startedAt) === null) {
    return false;
  }

  return getBreakElapsedSec(activeBreak, now) >= activeBreak.plannedDurationSec;
}

/**
 * When a break is finalised, the entry must end when the break was *due*, not
 * when koku next happened to notice.
 *
 * Without this, a 10-minute break taken before closing the laptop overnight
 * would be logged as a fourteen-hour break.
 */
export function getBreakEndIso(activeBreak: ActiveBreak, now = Date.now()): string {
  const startedAt = parse(activeBreak.startedAt);
  if (startedAt === null) {
    return new Date(now).toISOString();
  }

  if (activeBreak.plannedDurationSec > 0) {
    const dueAt = startedAt + activeBreak.plannedDurationSec * 1000;
    return new Date(Math.min(now, dueAt)).toISOString();
  }

  return new Date(now).toISOString();
}

export function formatBreakRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
