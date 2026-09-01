"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { toast } from "@/components/ui/toast";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerDraftStore, type TimerDraft } from "@/lib/stores/timer-draft-store";
import { useTimerStore } from "@/lib/stores/timer-store";
import { startTimerPausingRunning } from "@/lib/time-tracking/quick-timer";

export type CloneSource = TimerDraft;

/**
 * The one place "copy this entry into the timer" is implemented, so the
 * dashboard's recent-entries row and the log page's `DailyGrid` row can't
 * drift into different behavior.
 *
 * When `<Timer />` isn't mounted — the log page swaps it for a placeholder
 * card on any date other than today — there's nowhere for the draft to land,
 * so this also routes to `/log`, which always renders today's timer.
 *
 * If a timer is already running, there's no hidden start form to prefill —
 * the running timer card is what's on screen — so this pauses it and starts
 * the clone immediately instead of silently queuing a draft nothing shows.
 */
export function useCloneToTimer() {
  const router = useRouter();
  const requestDraft = useTimerDraftStore((state) => state.requestDraft);
  const timerMounted = useTimerDraftStore((state) => state.timerMounted);
  const { timers, activeBreak, startTimer, startSecondaryTimer, pauseTimer } = useTimerStore();
  const { prefs } = useNotificationPreferences();

  return useCallback(
    (entry: CloneSource) => {
      if (timers.length > 0) {
        const result = startTimerPausingRunning(
          { timers, activeBreak, blockNewTimers: prefs.breaks.blockNewTimers, startTimer, pauseTimer, startSecondaryTimer },
          { ...entry, startTime: new Date().toISOString(), pomodoroMode: false },
        );

        if (result.status === "blocked-break" || result.status === "blocked-running") {
          toast.error(result.message);
        } else {
          toast.success("Cloned entry started, previous timer paused.");
        }
        return;
      }

      requestDraft(entry);
      toast.success("Copied to the timer.");
      if (!timerMounted) {
        router.push("/log");
      }
    },
    [
      requestDraft,
      router,
      timerMounted,
      timers,
      activeBreak,
      startTimer,
      startSecondaryTimer,
      pauseTimer,
      prefs.breaks.blockNewTimers,
    ],
  );
}
