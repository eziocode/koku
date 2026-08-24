"use client";

import { useEffect } from "react";

import { publishPresence, type PresenceState } from "@/lib/presence/presence-writer";
import { useTimerStore } from "@/lib/stores/timer-store";

/** Operational status only. Synced settings keep it user-scoped without adding user data rows. */
export function PresenceHeartbeat() {
  useEffect(() => {
    const read = (): PresenceState => {
      const { timers, activeBreak } = useTimerStore.getState();
      const running = timers.find((timer) => !timer.pausedAt);
      const onBreak = activeBreak && !activeBreak.completedAt ? activeBreak : null;
      return {
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        work: running ? { title: running.title, startedAt: running.startTime } : null,
        break: onBreak ? { label: onBreak.label, startedAt: onBreak.startedAt } : null,
      };
    };
    let timerSignature = JSON.stringify(read());
    const send = (heartbeat = false) => {
      const state = read();
      timerSignature = JSON.stringify(state);
      publishPresence(state, heartbeat);
    };
    send();
    const timer = window.setInterval(() => send(true), 60_000);
    const changed = () => send();
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("blur", changed);
    const unsubscribe = useTimerStore.subscribe(() => {
      const nextSignature = JSON.stringify(read());
      if (nextSignature === timerSignature) return;
      timerSignature = nextSignature;
      publishPresence(read());
    });
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", changed); window.removeEventListener("focus", changed); window.removeEventListener("blur", changed); unsubscribe(); };
  }, []);
  return null;
}
