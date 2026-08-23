"use client";

import { useEffect, useRef } from "react";

import { format } from "date-fns";

import { kokuDb } from "@/lib/storage/db";
import { closeKokuNotifications, showKokuNotification } from "@/lib/notifications/client";
import { deriveCheckInContext } from "@/lib/notifications/context";
import { resolveDnd } from "@/lib/notifications/dnd";
import {
  clearEndOfDayState,
  readEndOfDayState,
  writeEndOfDayState,
} from "@/lib/notifications/end-of-day";
import { isSwToPageMessage } from "@/lib/notifications/messages";
import {
  buildCheckInNotification,
  buildEndOfDayDoneNotification,
  buildEndOfDayNotification,
  NOTIFICATION_TAGS,
} from "@/lib/notifications/payload";
import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import { readScheduleState, writeScheduleState } from "@/lib/notifications/runtime";
import { evaluateSchedule, reanchorSchedule } from "@/lib/notifications/schedule";
import type { NotificationPreferences } from "@/lib/notifications/settings";
import { useLeaderStatus } from "@/lib/notifications/use-leader";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";
import { stopTimerAndPersist } from "@/lib/time-tracking/stop-timer";

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

  // EOD: whether the feature can fire (permission required but master switch not required,
  // so the end-of-day guard works independently of the check-in schedule).
  const eodDeliverable = prefs.endOfDay.enabled && support.supported && permission === "granted";

  useEffect(() => {
    if (!eodDeliverable || !isLeader) {
      return;
    }

    // Handle SW → page messages for EOD actions (user clicking notification buttons).
    function onSwMessage(event: MessageEvent) {
      if (!isSwToPageMessage(event.data)) {
        return;
      }

      if (event.data.type === "eod-stop-timers") {
        const endedAt = new Date().toISOString();
        const timerIds = useTimerStore.getState().timers.map((t) => t.id);

        void Promise.all(timerIds.map((id) => stopTimerAndPersist(id, endedAt))).then(() => {
          clearEndOfDayState();
          void closeKokuNotifications(NOTIFICATION_TAGS.endOfDay);
        });

        return;
      }

      if (event.data.type === "eod-keep-running") {
        const state = readEndOfDayState();
        if (state) {
          writeEndOfDayState({ ...state, userResponded: true });
        }
        return;
      }
    }

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, [eodDeliverable, isLeader]);

  const active = (deliverable || eodDeliverable) && isLeader;

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

      // ── Recurring check-in ────────────────────────────────────────────────
      if (deliverable && isLeader) {
        const decision = evaluateSchedule(readScheduleState(), now, current.checkIn.intervalMinutes, {
          suppressed: isSuppressed(current, now),
        });

        writeScheduleState(decision.next);

        if (decision.fire) {
          const { timers, activeBreak } = useTimerStore.getState();
          const lastEntryTitle =
            timers.length === 0 && !activeBreak ? await readLastEntryTitle() : null;

          if (!cancelled) {
            const built = buildCheckInNotification(
              deriveCheckInContext(timers, activeBreak, lastEntryTitle, now),
              current,
              { maxActions: maxActionsRef.current },
              now,
            );

            if (built) {
              await showKokuNotification(built);
            }
          }
        }
      }

      if (cancelled) {
        return;
      }

      // ── End-of-day auto-stop check ────────────────────────────────────────
      const eodPrefs = current.endOfDay;
      if (eodPrefs.enabled) {
        const { timers: activeTimers } = useTimerStore.getState();
        if (activeTimers.length > 0) {
          const todayKey = format(new Date(now), "yyyy-MM-dd");
          const [eodHour, eodMin] = eodPrefs.logoffTime.split(":").map(Number);
          const logoffDate = new Date(now);
          logoffDate.setHours(eodHour, eodMin, 0, 0);
          const logoffMs = logoffDate.getTime();

          const eodState = readEndOfDayState();

          if (eodState?.firedForDay === todayKey && eodState.userResponded) {
            // User already responded — no further action today.
          } else if (eodState?.firedForDay === todayKey) {
            // Notification already fired; check whether grace period has expired.
            const elapsedMs = now - eodState.notifiedAt;
            const graceMs = eodPrefs.gracePeriodMinutes * 60_000;
            if (elapsedMs >= graceMs) {
              const endedAt = new Date(now).toISOString();
              const timerIds = useTimerStore.getState().timers.map((t) => t.id);
              await Promise.all(timerIds.map((id) => stopTimerAndPersist(id, endedAt)));
              clearEndOfDayState();
              void closeKokuNotifications(NOTIFICATION_TAGS.endOfDay);
              await showKokuNotification(buildEndOfDayDoneNotification(now));
            }
          } else if (now >= logoffMs) {
            // Past logoff time and not yet notified today — fire the wrap-up prompt.
            await showKokuNotification(
              buildEndOfDayNotification(eodPrefs.gracePeriodMinutes, { maxActions: maxActionsRef.current }, now),
            );
            writeEndOfDayState({ notifiedAt: now, firedForDay: todayKey, userResponded: false });
          }
        }
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
    if (!deliverable) {
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
  }, [deliverable, intervalMinutes]);

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
