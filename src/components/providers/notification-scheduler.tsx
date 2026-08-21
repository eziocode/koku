"use client";

import { useEffect, useRef } from "react";

import { kokuDb } from "@/lib/storage/db";
import { showKokuNotification } from "@/lib/notifications/client";
import { deriveCheckInContext } from "@/lib/notifications/context";
import { resolveDnd } from "@/lib/notifications/dnd";
import { buildCheckInNotification } from "@/lib/notifications/payload";
import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import { readScheduleState, writeScheduleState } from "@/lib/notifications/runtime";
import { evaluateSchedule, reanchorSchedule } from "@/lib/notifications/schedule";
import type { NotificationPreferences } from "@/lib/notifications/settings";
import { useLeaderStatus } from "@/lib/notifications/use-leader";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";

/**
 * How often we *check* whether a check-in is due — not how often one fires.
 *
 * The schedule itself is an absolute timestamp in localStorage, so this interval
 * only controls granularity, never cadence. That distinction is what makes the
 * whole thing immune to drift: a checker that runs late (or, in a hidden tab,
 * gets clamped to roughly once a minute) still computes the right answer whenever
 * it does run, and can never accumulate a backlog to deliver in a burst.
 */
const CHECK_INTERVAL_MS = 15_000;

async function readLastEntryTitle(): Promise<string | null> {
  try {
    const latest = await kokuDb.timeEntries.orderBy("startAt").last();
    return latest?.title ?? null;
  } catch {
    return null;
  }
}

function isSuppressed(prefs: NotificationPreferences, now: number): boolean {
  if (resolveDnd(prefs.dnd, now).active) {
    return true;
  }

  return prefs.quietHours.enabled && isWithinQuietHours(new Date(now), prefs.quietHours);
}

/**
 * Fires the recurring check-in. Renders nothing.
 *
 * When the feature is off there is deliberately no interval, no listener, and no
 * election: "off" means koku does no work at all, not that it works quietly.
 */
export function NotificationScheduler() {
  const { prefs, patch } = useNotificationPreferences();
  const { support, permission } = useNotificationPermission();

  const enabled = prefs.enabled && prefs.checkIn.enabled;
  const deliverable = enabled && support.supported && permission === "granted";
  const leaderStatus = useLeaderStatus();
  const isLeader = leaderStatus === "leader";

  // The tick reads preferences through refs so that changing one does not tear
  // down and rebuild the interval, which would re-anchor the cadence and mean a
  // user fiddling with settings never actually receives a check-in.
  const prefsRef = useRef(prefs);
  const maxActionsRef = useRef(support.maxActions);

  useEffect(() => {
    prefsRef.current = prefs;
    maxActionsRef.current = support.maxActions;
  }, [prefs, support.maxActions]);

  const active = deliverable && isLeader;

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }

      const current = prefsRef.current;
      const now = Date.now();
      const decision = evaluateSchedule(readScheduleState(), now, current.checkIn.intervalMinutes, {
        suppressed: isSuppressed(current, now),
      });

      writeScheduleState(decision.next);

      if (!decision.fire) {
        return;
      }

      const { timers, activeBreak } = useTimerStore.getState();
      const lastEntryTitle =
        timers.length === 0 && !activeBreak ? await readLastEntryTitle() : null;

      if (cancelled) {
        return;
      }

      const built = buildCheckInNotification(
        deriveCheckInContext(timers, activeBreak, lastEntryTitle, now),
        current,
        { maxActions: maxActionsRef.current },
        now,
      );

      if (built) {
        await showKokuNotification(built);
      }
    };

    const run = () => {
      void tick();
    };

    const intervalId = window.setInterval(run, CHECK_INTERVAL_MS);

    // A tab that was hidden or asleep may be well past due the moment it comes
    // back, so check immediately on these rather than waiting out the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    run();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, [active]);

  // Shortening the interval (say 60 minutes to 5) should take effect now rather
  // than after the remaining hour has elapsed.
  const intervalMinutes = prefs.checkIn.intervalMinutes;
  const previousIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      previousIntervalRef.current = null;
      return;
    }

    if (previousIntervalRef.current === null) {
      previousIntervalRef.current = intervalMinutes;
      return;
    }

    if (previousIntervalRef.current !== intervalMinutes) {
      previousIntervalRef.current = intervalMinutes;
      writeScheduleState(reanchorSchedule(readScheduleState(), Date.now(), intervalMinutes));
    }
  }, [active, intervalMinutes]);

  // A lapsed timed DND is cleared by the leader so the topbar pill disappears in
  // every tab, rather than each tab merely ignoring it locally.
  const dndMode = prefs.dnd.mode;
  const dndUntilIso = prefs.dnd.untilIso;

  useEffect(() => {
    if (!isLeader || dndMode !== "until") {
      return;
    }

    const state = resolveDnd({ mode: dndMode, untilIso: dndUntilIso }, Date.now());
    if (state.expired) {
      void patch({ dnd: { mode: "off", untilIso: null } });
      return;
    }

    if (state.expiresAt === null) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => void patch({ dnd: { mode: "off", untilIso: null } }),
      Math.max(0, state.expiresAt - Date.now()),
    );

    return () => window.clearTimeout(timeoutId);
  }, [isLeader, dndMode, dndUntilIso, patch]);

  return null;
}
