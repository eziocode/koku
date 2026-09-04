"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";
import { markReminderFired } from "@/lib/reminders/reminders";
import { kokuDb } from "@/lib/storage/db";
import { showKokuNotification } from "@/lib/notifications/client";
import { startReminderAlarm } from "@/lib/notifications/sound";
import { buildReminderNotification } from "@/lib/notifications/payload";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useLeaderStatus } from "@/lib/notifications/use-leader";

/** How often to check for a due reminder. See `notification-scheduler.tsx` for why this is a poll, not a timeout per-reminder: it stays correct across sleep/hidden-tab clamping with no drift or backlog risk. */
const CHECK_INTERVAL_MS = 15_000;

/**
 * Fires custom reminders: sound, toast, and (if permitted) a browser
 * notification. Leader-elected like `NotificationScheduler` so multiple open
 * tabs don't each play the chime and double-advance a repeating reminder.
 */
export function ReminderScheduler() {
  const { prefs } = useNotificationPreferences();
  const { permission } = useNotificationPermission();
  const leaderStatus = useLeaderStatus();
  const isLeader = leaderStatus === "leader";
  /** One alarm per still-ringing reminder, keyed by reminder id, so its toast's
   *  dismiss/auto-close can stop the right loop instead of all of them. */
  const alarmStops = useRef(new Map<string, () => void>());

  useEffect(() => {
    if (!isLeader) {
      return;
    }

    let cancelled = false;
    // Snapshot the ref's mutable map once per effect run — it's the same Map
    // instance for the component's lifetime, so this alias stays valid inside
    // the cleanup closure without React flagging a stale-ref read.
    const stops = alarmStops.current;

    const tick = async () => {
      if (cancelled) {
        return;
      }

      const now = Date.now();
      const all = await kokuDb.reminders.toArray();
      const firing = all.filter((reminder) => reminder.active && Date.parse(reminder.triggerAt) <= now);

      for (const reminder of firing) {
        if (cancelled) {
          return;
        }

        const stopAlarm = () => {
          stops.get(reminder.id)?.();
          stops.delete(reminder.id);
        };

        if (prefs.sound.enabled) {
          stopAlarm();
          stops.set(reminder.id, startReminderAlarm(prefs.sound.volume, prefs.reminders.beepSeconds));
        }

        toast.info(reminder.message, {
          id: `reminder-${reminder.id}`,
          duration: Math.max(10_000, prefs.reminders.beepSeconds * 1000),
          onDismiss: stopAlarm,
          onAutoClose: stopAlarm,
        });

        if (permission === "granted") {
          void showKokuNotification(buildReminderNotification(reminder.id, reminder.message, now));
        }

        await markReminderFired(reminder);
      }
    };

    const run = () => {
      void tick();
    };

    const intervalId = window.setInterval(run, CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    run();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      // Losing leadership (or unmounting) mid-ring shouldn't leave this tab
      // beeping forever with nothing left to stop it.
      for (const stop of stops.values()) {
        stop();
      }
      stops.clear();
    };
  }, [isLeader, permission, prefs.sound.enabled, prefs.sound.volume, prefs.reminders.beepSeconds]);

  return null;
}
