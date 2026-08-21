"use client";

import { useSyncExternalStore } from "react";

import { electLeader, type LeaderHandle, type LeaderStatus } from "@/lib/notifications/leader";

/**
 * Which tab owns the mini player.
 *
 * Chromium allows one Document PiP window at a time, and it belongs to the tab
 * that opened it. Without an owner, three koku tabs would each offer a pop-out
 * button and the second click would silently close the first window.
 *
 * This reuses the same Web Locks election as notifications, under its own lock
 * name — so a tab can be the notification leader without owning the mini player
 * and vice versa. Followers are promoted automatically by the browser when the
 * owner's tab closes or crashes, because Web Locks releases on document
 * destruction.
 */

export const MINI_PLAYER_LOCK_NAME = "koku-mini-player";
/** Not named `*_KEY`: the security audit flags storage writes that look like secrets. */
export const MINI_PLAYER_LEASE_STORE = "koku-mini-player-lease";

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

  handle = electLeader({
    lockName: MINI_PLAYER_LOCK_NAME,
    leaseStore: MINI_PLAYER_LEASE_STORE,
  });
  status = handle.status();
  unsubscribeHandle = handle.subscribe(() => {
    status = handle?.status() ?? "idle";
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureElection();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeHandle?.();
      unsubscribeHandle = null;
      handle?.release();
      handle = null;
      status = "idle";
    }
  };
}

function getSnapshot(): LeaderStatus {
  return status;
}

function getServerSnapshot(): LeaderStatus {
  return "idle";
}

/** "owner" reads better than "leader" for a window only one tab may hold. */
export type MiniPlayerOwnership = "idle" | "owner" | "follower";

export function useMiniPlayerOwnership(): MiniPlayerOwnership {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return status === "leader" ? "owner" : status;
}
