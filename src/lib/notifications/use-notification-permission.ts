"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  detectNotificationSupport,
  getPermissionState,
  requestNotificationPermission,
  type NotificationSupport,
  type PermissionState,
} from "@/lib/notifications/permission";

/**
 * Notification support and permission, as an external store.
 *
 * Capability is read lazily on first subscribe rather than during render: doing
 * it in render would have the server say "unsupported" and the client say
 * "supported", which is a hydration mismatch.
 *
 * Permission has no change event that every browser implements, so this listens
 * on the Permissions API where it exists and falls back to re-reading on
 * visibility change — which covers the realistic case of the user flipping it in
 * browser settings and switching back to the tab.
 *
 * The snapshot object is cached and only replaced when a value actually changes,
 * because `useSyncExternalStore` compares snapshots by identity.
 */

export interface NotificationPermissionState {
  support: NotificationSupport;
  permission: PermissionState;
}

const SERVER_SNAPSHOT: NotificationPermissionState = {
  support: { supported: false, reason: "no-notification-api", maxActions: 0, supportsActions: false },
  permission: "unsupported",
};

const listeners = new Set<() => void>();
let snapshot: NotificationPermissionState = SERVER_SNAPSHOT;
let permissionStatus: PermissionStatus | null = null;
let listening = false;

function refresh() {
  const support = detectNotificationSupport();
  const permission = getPermissionState();

  if (
    snapshot.permission === permission &&
    snapshot.support.supported === support.supported &&
    snapshot.support.maxActions === support.maxActions
  ) {
    return;
  }

  snapshot = { support, permission };
  for (const listener of listeners) {
    listener();
  }
}

function startListening() {
  if (listening) {
    return;
  }

  listening = true;
  refresh();
  document.addEventListener("visibilitychange", refresh);

  if (typeof navigator !== "undefined" && "permissions" in navigator) {
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((status) => {
        permissionStatus = status;
        status.addEventListener("change", refresh);
      })
      .catch(() => {
        /* not queryable here — the visibility fallback covers it */
      });
  }
}

function stopListening() {
  listening = false;
  document.removeEventListener("visibilitychange", refresh);
  permissionStatus?.removeEventListener("change", refresh);
  permissionStatus = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startListening();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopListening();
    }
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useNotificationPermission() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Call only from a user gesture — Safari enforces it, Chrome prefers it. */
  const request = useCallback(async () => {
    const next = await requestNotificationPermission();
    refresh();
    return next;
  }, []);

  return { support: state.support, permission: state.permission, request };
}
