"use client";

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";
import { getBreakElapsedSec, getBreakEndIso, isBreakComplete } from "@/lib/breaks/break-math";
import { showKokuNotification } from "@/lib/notifications/client";
import { buildBreakCompleteNotification } from "@/lib/notifications/payload";
import { useLeaderStatus } from "@/lib/notifications/use-leader";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { writeBreakEntry } from "@/lib/breaks/finalize-break";

/**
 * Finalises a break when its time is up. Renders nothing.
 *
 * Leader-tab only, so three open tabs do not each write a break entry — belt and
 * braces with `finishBreak`'s own `completedAt` guard.
 *
 * Two ordering rules matter here:
 *
 *  1. The entry is written BEFORE `finishBreak`, mirroring how stopping a timer
 *     saves before it removes. If the Dexie write fails, the break stays active
 *     and can be retried rather than the record vanishing.
 *
 *  2. The entry ends when the break was *due*, not when koku noticed. A ten
 *     minute break taken before closing the laptop overnight must log ten
 *     minutes, not fourteen hours — that is what `getBreakEndIso` clamps.
 */
export function BreakRunner() {
  const { prefs } = useNotificationPreferences();
  const activeBreak = useTimerStore((state) => state.activeBreak);
  const finishBreak = useTimerStore((state) => state.finishBreak);
  const isLeader = useLeaderStatus() === "leader";

  // Subscribing to the shared tick only while a break is running keeps this
  // component inert the rest of the time.
  const hasBreak = Boolean(activeBreak && !activeBreak.completedAt);
  const tickNow = useSecondTick();

  useEffect(() => {
    if (!isLeader || !hasBreak || !activeBreak) {
      return;
    }

    if (!isBreakComplete(activeBreak, tickNow)) {
      return;
    }

    let cancelled = false;

    const finalise = async () => {
      const endedAt = getBreakEndIso(activeBreak, Date.now());
      const elapsedSec = Math.max(
        0,
        Math.floor((Date.parse(endedAt) - Date.parse(activeBreak.startedAt)) / 1000),
      );

      try {
        await writeBreakEntry(activeBreak, {
          endAtIso: endedAt,
          elapsedSec,
          outcome: "completed",
        });
      } catch {
        // Leave the break active so the next tick retries rather than losing it.
        toast.error("Couldn’t log your break. It’s still running so this can retry.");
        return;
      }

      if (cancelled) {
        return;
      }

      const completion = finishBreak("completed", { autoResume: prefs.breaks.autoResume });
      if (!completion) {
        return;
      }

      if (prefs.enabled && prefs.breaks.notifyOnComplete) {
        void showKokuNotification(
          buildBreakCompleteNotification(activeBreak.label, getBreakElapsedSec(activeBreak, Date.parse(endedAt))),
        );
      }

      toast.success(
        completion.resumedTimerIds.length > 0
          ? `${activeBreak.label} finished. Your timer is running again.`
          : `${activeBreak.label} finished.`,
      );
    };

    void finalise();

    return () => {
      cancelled = true;
    };
  }, [isLeader, hasBreak, activeBreak, tickNow, finishBreak, prefs.breaks.autoResume, prefs.breaks.notifyOnComplete, prefs.enabled]);

  return null;
}
