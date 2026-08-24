"use client";

import { useCallback, useEffect } from "react";

import { useSettings } from "@/lib/storage/hooks/use-settings";
import { useTimerStore } from "@/lib/stores/timer-store";

/** Operational status only. Synced settings keep it user-scoped without adding user data rows. */
export function PresenceHeartbeat() {
  const { setSetting } = useSettings();
  const send = useCallback(() => {
    const { timers, activeBreak } = useTimerStore.getState();
    const running = timers.find((timer) => !timer.pausedAt);
    const onBreak = activeBreak && !activeBreak.completedAt ? activeBreak : null;
    void setSetting("adminPresence", {
      seenAt: new Date().toISOString(),
      visible: document.visibilityState === "visible",
      focused: document.hasFocus(),
      work: running ? { title: running.title, startedAt: running.startTime } : null,
      break: onBreak ? { label: onBreak.label, startedAt: onBreak.startedAt } : null,
    });
  }, [setSetting]);

  useEffect(() => {
    send();
    const timer = window.setInterval(send, 60_000);
    const changed = () => send();
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("blur", changed);
    const unsubscribe = useTimerStore.subscribe(changed);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", changed); window.removeEventListener("focus", changed); window.removeEventListener("blur", changed); unsubscribe(); };
  }, [send]);
  return null;
}
