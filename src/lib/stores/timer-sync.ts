"use client";

import { useTimerStore } from "@/lib/stores/timer-store";

/** The zustand `persist` key. Must match `timer-store.ts`. */
export const TIMER_PERSIST_STORE = "koku-active-timer";

/**
 * Keeps timer and break state consistent across tabs.
 *
 * The `storage` event is the right tool here, and notably simpler than a
 * BroadcastChannel state-replication layer: it fires **only in other tabs**, so
 * there is no echo to suppress and no revision counter needed to break ties, and
 * zustand's own persist write is what emits it — so there is nothing extra to
 * broadcast. Last-writer-wins, which is correct for a single-user local app.
 *
 * This also closes a pre-existing bug: `startTimer`'s "only one primary timer"
 * guard reads this tab's state, so before this, two tabs could each start their
 * own primary timer. Now tab B rehydrates tab A's timer and the guard works.
 * (Two truly simultaneous starts still race; that window is milliseconds wide.)
 */
export function subscribeTimerStoreToOtherTabs(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== TIMER_PERSIST_STORE) {
      return;
    }

    void useTimerStore.persist.rehydrate();
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
