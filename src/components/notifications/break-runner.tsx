"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";
import { getBreakElapsedSec, getBreakEndIso, isBreakComplete } from "@/lib/breaks/break-math";
import { resolvePeriodCopy } from "@/lib/breaks/break-copy";
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
 * Leader-tab only, so three open tabs do not each write a break entry. That
 * alone isn't enough, though: this effect depends on the shared per-second
 * tick, so while a break sits complete-but-not-yet-finalised it re-runs every
 * second. `finalisedRef` is the actual guard against a duplicate write — it
 * remembers which break ids this client has already written (or has a write
 * in flight for), independent of how many times the effect re-enters.
 *
 * Two ordering rules matter here:
 *
 *  1. The entry is written BEFORE `finishBreak`, mirroring how stopping a timer
 *     saves before it removes. If the Dexie write fails, the break stays active
 *     and can be retried rather than the record vanishing — which is also why
 *     `finalisedRef` is *cleared* on failure, not just checked.
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
  const isComplete = hasBreak && activeBreak ? isBreakComplete(activeBreak, tickNow) : false;

  // Break ids already written (or being written) by this client. A Set, not a
  // single id, so it survives across different breaks without ever growing
  // unbounded in practice — a session logs, at most, a handful of breaks.
  const finalisedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLeader || !isComplete || !activeBreak) {
      return;
    }

    if (finalisedRef.current.has(activeBreak.id)) {
      return;
    }
    finalisedRef.current.add(activeBreak.id);

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
        // Leave the break active so the next tick retries rather than losing
        // it — and let it retry, by giving back the id we just claimed.
        finalisedRef.current.delete(activeBreak.id);
        toast.error(resolvePeriodCopy(activeBreak).logFailedMessage);
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

      toast.success(resolvePeriodCopy(activeBreak).endedToast(completion.resumedTimerIds.length));
    };

    void finalise();

    return () => {
      cancelled = true;
    };
  }, [isLeader, isComplete, activeBreak, finishBreak, prefs.breaks.autoResume, prefs.breaks.notifyOnComplete, prefs.enabled]);

  return null;
}
