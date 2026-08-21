"use client";

import { useSyncExternalStore } from "react";

import { electLeader, type LeaderHandle, type LeaderStatus } from "@/lib/notifications/leader";

/**
 * Leadership as an external store rather than effect-driven state.
 *
 * Two reasons this is a module singleton with a subscriber count rather than one
 * election per hook call: several components ask whether this tab leads (the
 * scheduler, the break runner), and each running its own election would mean
 * several locks and several answers. And `useSyncExternalStore` keeps the value
 * hydration-safe, since the server has no concept of a leader tab.
 */

const listeners = new Set<() => void>();
let handle: LeaderHandle | null = null;
let unsubscribeHandle: (() => void) | null = null;
let status: LeaderStatus = "idle";

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function ensureElection() {
  if (handle) {
    return;
  }

  handle = electLeader();
  status = handle.status();
  unsubscribeHandle = handle.subscribe(() => {
    status = handle?.status() ?? "idle";
    emit();
  });
}

function teardown() {
  unsubscribeHandle?.();
  unsubscribeHandle = null;
  handle?.release();
  handle = null;
  status = "idle";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureElection();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown();
    }
  };
}

function getSnapshot(): LeaderStatus {
  return status;
}

/** Never a leader on the server, so nothing can fire during render. */
function getServerSnapshot(): LeaderStatus {
  return "idle";
}

export function useLeaderStatus(): LeaderStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
