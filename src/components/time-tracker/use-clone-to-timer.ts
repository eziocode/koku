"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { toast } from "@/components/ui/toast";
import { useTimerDraftStore, type TimerDraft } from "@/lib/stores/timer-draft-store";

export type CloneSource = TimerDraft;

/**
 * The one place "copy this entry into the timer" is implemented, so the
 * dashboard's recent-entries row and the log page's `DailyGrid` row can't
 * drift into different behavior.
 *
 * When `<Timer />` isn't mounted — the log page swaps it for a placeholder
 * card on any date other than today — there's nowhere for the draft to land,
 * so this also routes to `/log`, which always renders today's timer.
 */
export function useCloneToTimer() {
  const router = useRouter();
  const requestDraft = useTimerDraftStore((state) => state.requestDraft);
  const timerMounted = useTimerDraftStore((state) => state.timerMounted);

  return useCallback(
    (entry: CloneSource) => {
      requestDraft(entry);
      toast.success("Copied to the timer.");
      if (!timerMounted) {
        router.push("/log");
      }
    },
    [requestDraft, router, timerMounted],
  );
}
