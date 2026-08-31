"use client";

import { useCallback, useEffect, useRef } from "react";

import { format } from "date-fns";

import { kokuDb } from "@/lib/storage/db";
import { closeKokuNotifications, showKokuNotification } from "@/lib/notifications/client";
import { deriveQuietHours } from "@/lib/notifications/adaptive-quiet-hours";
import { deriveCheckInContext } from "@/lib/notifications/context";
import { resolveDnd } from "@/lib/notifications/dnd";
import {
  clearEndOfDayState,
  readEndOfDayState,
  writeEndOfDayState,
} from "@/lib/notifications/end-of-day";
import {
  EOD_PARAM,
  EOD_SNOOZE_MINUTES,
  isEodActionId,
  isSwToPageMessage,
  type EodNotificationActionId,
} from "@/lib/notifications/messages";
import {
  buildCheckInNotification,
  buildEndOfDayDoneNotification,
  buildEndOfDayNotification,
  buildEndOfDaySnoozedNotification,
  NOTIFICATION_TAGS,
} from "@/lib/notifications/payload";
import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import { readScheduleState, writeScheduleState } from "@/lib/notifications/runtime";
import { evaluateSchedule, reanchorSchedule } from "@/lib/notifications/schedule";
import { isHolidayDate, type NotificationPreferences } from "@/lib/notifications/settings";
import { useLeaderStatus } from "@/lib/notifications/use-leader";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";
import { stopTimerAndPersist } from "@/lib/time-tracking/stop-timer";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

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

/**
 * How often the leader checks whether adaptive quiet hours are due for a
 * recompute. Coarser than `CHECK_INTERVAL_MS`: the recompute itself is
 * guarded to at most once per local day (see `lastAutoRecomputeDayRef`), so
 * there is nothing to gain from checking every 15 seconds.
 */
const AUTO_QUIET_HOURS_CHECK_MS = 60 * 60 * 1000;

async function readLastEntryTitle(): Promise<string | null> {
  try {
    const latest = await kokuDb.timeEntries.orderBy("startAt").last();
    return latest?.title ?? null;
  } catch {
    return null;
  }
}

function isSuppressed(prefs: NotificationPreferences, now: number): boolean {
  if (resolveDnd(prefs.dnd, now).active) return true;
  if (prefs.quietHours.enabled && isWithinQuietHours(new Date(now), prefs.quietHours)) return true;
  if (prefs.silentDays.length > 0 && prefs.silentDays.includes(new Date(now).getDay())) return true;
  if (isHolidayDate(prefs.holidayDates, now)) return true;
  return false;
}

/**
 * Fires the recurring check-in. Renders nothing.
 *
 * When the feature is off there is deliberately no interval, no listener, and no
 * election: "off" means koku does no work at all, not that it works quietly.
 */
export function NotificationScheduler() {
  const { prefs, patch } = useNotificationPreferences();
  const { value: timeFormat } = useTypedSetting("timeFormat");
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
  const timeFormatRef = useRef(timeFormat);

  useEffect(() => {
    prefsRef.current = prefs;
    maxActionsRef.current = support.maxActions;
    timeFormatRef.current = timeFormat;
  }, [prefs, support.maxActions, timeFormat]);

  // EOD: whether the feature can fire (permission required but master switch not required,
  // so the end-of-day guard works independently of the check-in schedule).
  const eodDeliverable = prefs.endOfDay.enabled && support.supported && permission === "granted";

  /**
   * Applies one end-of-day answer.
   *
   * Deliberately not gated on leadership. The worker now delivers these to a
   * single window rather than broadcasting (see `deliverToOne` in
   * `public/sw.js`), so whichever tab is handed the answer is the one that must
   * act on it — requiring that tab to also hold the leader lock would drop the
   * answer whenever the user clicked from any tab but the leader, which is what
   * made the buttons look dead with more than one tab open.
   */
  const applyEodAction = useCallback(async (action: EodNotificationActionId) => {
    if (action === "eod-stop") {
      const endedAt = new Date().toISOString();
      const timerIds = useTimerStore.getState().timers.map((timer) => timer.id);
      await Promise.all(timerIds.map((id) => stopTimerAndPersist(id, endedAt)));
      clearEndOfDayState();
      await closeKokuNotifications(NOTIFICATION_TAGS.endOfDay);
      return;
    }

    if (action === "eod-snooze") {
      const now = Date.now();
      const resumeAt = now + EOD_SNOOZE_MINUTES * 60_000;
      const state = readEndOfDayState();

      writeEndOfDayState({
        notifiedAt: now,
        firedForDay: state?.firedForDay ?? format(new Date(now), "yyyy-MM-dd"),
        userResponded: false,
        snoozedUntil: resumeAt,
      });

      // Replaces the prompt rather than leaving the tray silent for 15 minutes,
      // so a snooze is visibly a snooze and not a click that did nothing.
      await showKokuNotification(buildEndOfDaySnoozedNotification(resumeAt, now, timeFormatRef.current));
      return;
    }

    // eod-keep — answered for the day; no auto-stop, no re-prompt.
    const state = readEndOfDayState();
    const now = Date.now();
    writeEndOfDayState({
      notifiedAt: state?.notifiedAt ?? now,
      firedForDay: state?.firedForDay ?? format(new Date(now), "yyyy-MM-dd"),
      userResponded: true,
      snoozedUntil: null,
    });
    await closeKokuNotifications(NOTIFICATION_TAGS.endOfDay);
  }, []);

  /**
   * Listens in every tab, not just the leader, and regardless of whether the
   * feature is currently enabled: an answer to a notification koku already sent
   * has to be honoured even if the user switched the feature off in between.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    function onSwMessage(event: MessageEvent) {
      if (!isSwToPageMessage(event.data)) {
        return;
      }

      if (event.data.type === "eod-stop-timers") {
        void applyEodAction("eod-stop");
        return;
      }

      if (event.data.type === "eod-snooze") {
        void applyEodAction("eod-snooze");
        return;
      }

      if (event.data.type === "eod-keep-running") {
        void applyEodAction("eod-keep");
      }
    }

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, [applyEodAction]);

  /**
   * Picks up an answer that arrived in the URL.
   *
   * The wrap-up prompt is `requireInteraction`, so it survives every koku tab
   * being closed. Clicking a button then has no window to post to, and the
   * worker opens one with the answer as a query parameter instead. The parameter
   * is stripped immediately so a reload or a shared link cannot replay it.
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const raw = url.searchParams.get(EOD_PARAM);
    if (!raw) {
      return;
    }

    url.searchParams.delete(EOD_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    if (isEodActionId(raw)) {
      void applyEodAction(raw);
    }
  }, [applyEodAction]);

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
      // A holiday silences the wrap-up prompt too: it is a notification, and
      // auto-stopping a timer the user deliberately left running on a day off
      // would be a surprise, not a service.
      if (eodPrefs.enabled && !isHolidayDate(current.holidayDates, now)) {
        const { timers: activeTimers } = useTimerStore.getState();
        if (activeTimers.length > 0) {
          const todayKey = format(new Date(now), "yyyy-MM-dd");
          const [eodHour, eodMin] = eodPrefs.logoffTime.split(":").map(Number);
          const logoffDate = new Date(now);
          logoffDate.setHours(eodHour, eodMin, 0, 0);
          const logoffMs = logoffDate.getTime();

          const eodState = readEndOfDayState();

          const firedToday = eodState?.firedForDay === todayKey;

          if (firedToday && eodState.userResponded) {
            // "Skip today" — answered, so neither re-prompt nor auto-stop.
          } else if (firedToday && eodState.snoozedUntil !== null) {
            // Snoozed. The grace clock is deliberately not running during a
            // snooze: `notifiedAt` is re-stamped when the prompt comes back, so
            // "+15 min" cannot quietly bring the auto-stop forward.
            if (now >= eodState.snoozedUntil) {
              await showKokuNotification(
                buildEndOfDayNotification(
                  eodPrefs.gracePeriodMinutes,
                  { maxActions: maxActionsRef.current },
                  now,
                ),
              );
              writeEndOfDayState({
                notifiedAt: now,
                firedForDay: todayKey,
                userResponded: false,
                snoozedUntil: null,
              });
            }
          } else if (firedToday) {
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
            writeEndOfDayState({
              notifiedAt: now,
              firedForDay: todayKey,
              userResponded: false,
              snoozedUntil: null,
            });
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
  }, [active, deliverable, isLeader]);

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

  // Adaptive quiet hours: recomputed from recent logs at most once per local
  // day, and only by the leader tab, so multiple open tabs don't race to patch
  // the same setting. Reads through `prefsRef` for the current window (rather
  // than a dependency) so toggling other, unrelated preferences doesn't tear
  // down and restart this interval.
  const quietHoursAuto = prefs.quietHours.auto;
  const lastAutoRecomputeDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLeader || !quietHoursAuto) {
      lastAutoRecomputeDayRef.current = null;
      return;
    }

    let cancelled = false;

    const recompute = async () => {
      const todayKey = format(new Date(), "yyyy-MM-dd");
      if (lastAutoRecomputeDayRef.current === todayKey) {
        return;
      }

      const entries = await kokuDb.timeEntries.toArray();
      if (cancelled) {
        return;
      }

      lastAutoRecomputeDayRef.current = todayKey;
      const { startMinute, endMinute } = prefsRef.current.quietHours;
      const proposal = deriveQuietHours(entries, { startMinute, endMinute });
      if (proposal) {
        await patch({ quietHours: proposal });
      }
    };

    void recompute();
    const intervalId = window.setInterval(() => void recompute(), AUTO_QUIET_HOURS_CHECK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isLeader, quietHoursAuto, patch]);

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
