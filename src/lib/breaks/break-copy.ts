import type { ActiveBreak } from "@/lib/stores/timer-types";

export type PeriodLike = Pick<ActiveBreak, "label" | "tag"> | null;

export interface PeriodCopy {
  isQuickAction: boolean;
  /** Verbatim label, or "Break" for a plain break. Always shown as-is in buttons/badges. */
  label: string;
  /** The label rendered inline within a sentence — lowercased if one word, quoted verbatim otherwise. */
  inlineLabel: string;
  statusBadge: string;
  statusLine: string;
  statusLineShort: string;
  endLabel: string;
  cancelLabel: string;
  progressLabel: string;
  notePrompt: string;
  timerStatus: (pausedCount: number) => string;
  heroCaption: string;
  startedToast: (pausedCount: number) => string;
  endedToast: (resumedCount: number) => string;
  blockedTimerMessage: string;
  alreadyRunningMessage: string;
  logFailedMessage: string;
  quickNoteTarget: string;
  completeNotificationTitle: string;
}

/**
 * Renders a period's label inline within a sentence.
 *
 * A single word reads naturally lowercased ("Call" → "the call ends"). A
 * multi-word label doesn't — "the standup with ravi ends" looks like a typo —
 * so it's quoted verbatim instead ('the "Standup with Ravi" ends').
 */
function inlineLabel(label: string): string {
  return label.trim().includes(" ") ? `"${label}"` : label.toLowerCase();
}

/**
 * Central source of every user-facing string that depends on whether the
 * current break is a plain break or a named quick action ("Call", "Standup").
 *
 * Passing `null` returns plain-break strings, so callers never need to branch
 * on whether a break is active — only on what it says.
 */
export function resolvePeriodCopy(period: PeriodLike): PeriodCopy {
  const isQuickAction = Boolean(period?.tag);
  const label = period?.label || "Break";
  const inline = inlineLabel(label);

  return {
    isQuickAction,
    label,
    inlineLabel: inline,
    statusBadge: isQuickAction ? "Running" : "On a break",
    statusLine: isQuickAction
      ? `Timers are paused until ${inline} ends.`
      : "Timers are paused until the break ends.",
    statusLineShort: isQuickAction ? `On ${inline}` : "On a break",
    endLabel: isQuickAction ? `End ${inline} now` : "End break now",
    cancelLabel: "Cancel",
    progressLabel: isQuickAction ? `${label} progress` : "Break progress",
    notePrompt: isQuickAction ? `What are you doing on ${inline}?` : "What's on your mind?",
    timerStatus: (pausedCount) => {
      const onNoun = isQuickAction ? `On ${inline}` : "On a break";
      return pausedCount ? `${onNoun} · ${pausedCount === 1 ? "timer" : "timers"} paused` : onNoun;
    },
    heroCaption: isQuickAction
      ? `Tracked so far today, paused while you're on ${inline}`
      : "Tracked so far today, paused while you are on a break",
    startedToast: (pausedCount) =>
      pausedCount > 0
        ? `${label} started. ${pausedCount === 1 ? "Your timer is" : "Your timers are"} paused.`
        : `${label} started.`,
    endedToast: (resumedCount) =>
      resumedCount > 0 ? `${label} ended. Your timer is running again.` : `${label} ended.`,
    blockedTimerMessage: isQuickAction
      ? `Finish or cancel ${inline} before starting a timer.`
      : "Finish or cancel your break before starting a timer.",
    alreadyRunningMessage: isQuickAction
      ? `${label} is already running.`
      : "A break is already running.",
    logFailedMessage: `Couldn't log your ${inline}. It's still running so you can retry.`,
    quickNoteTarget: `Appends to your ${inline}`,
    completeNotificationTitle: `${label} finished`,
  };
}
