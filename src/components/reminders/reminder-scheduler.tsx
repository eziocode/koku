"use client";

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";
import { markReminderFired } from "@/lib/reminders/reminders";
import { kokuDb } from "@/lib/storage/db";
import { showKokuNotification } from "@/lib/notifications/client";
import { playReminderChime } from "@/lib/notifications/sound";
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

  useEffect(() => {
    if (!isLeader) {
      return;
    }

    let cancelled = false;

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

        if (prefs.sound.enabled) {
          playReminderChime(prefs.sound.volume);
        }

        toast.info(reminder.message, { id: `reminder-${reminder.id}`, duration: 10_000 });

        if (permission === "granted") {
          void showKokuNotification(buildReminderNotification(reminder.id, reminder.message, now));
        }

        await markReminderFired(reminder, new Date(now).toISOString());
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
    };
  }, [isLeader, permission, prefs.sound.enabled, prefs.sound.volume]);

  return null;
}
