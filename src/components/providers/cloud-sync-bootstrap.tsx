"use client";

import { useEffect } from "react";

import { flushPendingChanges } from "@/lib/sync/sync-engine";
import { startLiveStateSync } from "@/lib/stores/live-state-sync";

export const RETRY_INTERVAL_MS = 15 * 60 * 1000;

/** Retry queued local mutations without polling cloud when there is no work. */
export function CloudSyncBootstrap() {
  useEffect(() => {
    const retry = () => { void flushPendingChanges({ notifyOnFailure: true }); };
    retry();
    const interval = window.setInterval(retry, RETRY_INTERVAL_MS);
    window.addEventListener("online", retry);
    const stopLiveSync = startLiveStateSync();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", retry);
      stopLiveSync();
    };
  }, []);

  return null;
}
