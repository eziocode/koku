"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { BreakRunner } from "@/components/notifications/break-runner";
import { NotificationScheduler } from "@/components/providers/notification-scheduler";
import { subscribeTimerStoreToOtherTabs } from "@/lib/stores/timer-sync";
import { resyncTicker } from "@/lib/stores/use-ticker";
import { useNotificationPermission } from "@/lib/notifications/use-notification-permission";
import { toast } from "@/components/ui/toast";

const PERMISSION_REMINDER_INTERVAL_MS = 60 * 60 * 1000;

function NotificationPermissionReminder() {
  const router = useRouter();
  const { support, permission } = useNotificationPermission();

  useEffect(() => {
    if (!support.supported || permission === "granted") return;

    const remind = () => {
      if (document.visibilityState !== "visible") return;
      toast.info("Don’t miss helpful koku reminders. Enable notifications for a smoother experience.", {
        id: "notification-permission-hourly-reminder",
        duration: 12_000,
        action: { label: "Enable", onClick: () => router.push("/settings/notifications") },
      });
    };

    const timer = window.setInterval(remind, PERMISSION_REMINDER_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [permission, router, support.supported]);

  return null;
}

/**
 * Mounts the always-on notification machinery.
 *
 * Lives in `AppProviders`, which sits in the root layout and therefore does not
 * remount across App Router navigation — so the check-in cadence survives moving
 * between pages with no extra work.
 *
 * Note that the user-facing pieces (`NotificationCenter`, the DND pill) are
 * mounted in `AppShell` instead, because they only make sense inside the app
 * itself, not on the marketing root.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  useEffect(() => subscribeTimerStoreToOtherTabs(), []);

  // Interval callbacks are throttled or suspended while a tab is hidden, so on
  // the way back the shared clock can be up to a second stale. Forcing one tick
  // means the first paint after a sleep already shows the right time.
  useEffect(() => {
    const resync = () => resyncTicker();

    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);

    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, []);

  return (
    <>
      {children}
      <NotificationScheduler />
      <BreakRunner />
      <NotificationPermissionReminder />
    </>
  );
}
