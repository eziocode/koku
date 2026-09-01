"use client";

import { useEffect } from "react";

import { flushPendingChanges } from "@/lib/sync/sync-engine";
import { repairTimeEntryTimestamps } from "@/lib/sync/repair-time-entries";
import { startLiveStateSync } from "@/lib/stores/live-state-sync";
import { kokuDb } from "@/lib/storage/db";

export const RETRY_INTERVAL_MS = 15 * 60 * 1000;

/**
 * One-time key guarding the local repair for entries a since-fixed sync bug
 * saved with a raw, timezone-less Catalyst timestamp (see
 * `repair-time-entries.ts`). Purely local bookkeeping, never synced — every
 * device with corrupted rows needs its own pass.
 */
const REPAIR_DONE_KEY = "timeEntryTimestampRepairV1";

async function runTimeEntryRepairOnce() {
  try {
    if (await kokuDb.settings.get(REPAIR_DONE_KEY)) return;
    await repairTimeEntryTimestamps();
    await kokuDb.settings.put({ key: REPAIR_DONE_KEY, value: true });
  } catch {
    // Left unset: the next mount retries rather than silently giving up on
    // entries that are still showing the wrong time.
  }
}

/** Retry queued local mutations without polling cloud when there is no work. */
export function CloudSyncBootstrap() {
  useEffect(() => {
    void runTimeEntryRepairOnce();
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
