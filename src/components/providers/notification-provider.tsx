"use client";

import { useEffect, type ReactNode } from "react";

import { BreakRunner } from "@/components/notifications/break-runner";
import { NotificationScheduler } from "@/components/providers/notification-scheduler";
import { subscribeTimerStoreToOtherTabs } from "@/lib/stores/timer-sync";
import { resyncTicker } from "@/lib/stores/use-ticker";

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
    </>
  );
}
