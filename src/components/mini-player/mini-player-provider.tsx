"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { MiniPlayerSurface } from "@/components/mini-player/mini-player-surface";
import { useMiniPlayerPreferences } from "@/lib/notifications/use-notification-preferences";
import { useMiniPlayerOwnership } from "@/lib/mini-player/ownership";
import {
  closeMiniPlayerWindow,
  getMiniPlayerServerState,
  getMiniPlayerWindowState,
  openMiniPlayerWindow,
  subscribeMiniPlayerWindow,
} from "@/lib/mini-player/window-controller";
import { useTimerStore } from "@/lib/stores/timer-store";

/**
 * Hosts the mini player. Renders nothing in the main document.
 *
 * The surface is portalled into the PiP window from a component that stays
 * mounted here, so it shares this tree's React context, the zustand store, and
 * the Dexie `liveQuery` subscriptions — stopping a timer from the mini player
 * updates `/log` live, with no extra wiring.
 *
 * Mounted in `AppShell` rather than `AppProviders` because `AppProviders` also
 * wraps the marketing root, which has no timer and should never hold an OS
 * window or a lock. The accepted trade-off is that navigating to `/` unmounts
 * this and closes the window — predictable, and better than an orphaned window
 * showing stale state.
 */
export function MiniPlayerProvider() {
  const { prefs } = useMiniPlayerPreferences();
  const ownership = useMiniPlayerOwnership();
  const windowState = useSyncExternalStore(
    subscribeMiniPlayerWindow,
    getMiniPlayerWindowState,
    getMiniPlayerServerState,
  );

  const isOwner = ownership === "owner";
  const autoOpen = prefs.enabled && prefs.autoOpenOnStart && isOwner;

  /**
   * Auto-open on timer start.
   *
   * Subscribed once here rather than called from each start path, so the policy
   * lives in one place and `handleStart`, the command palette, and any future
   * entry point all behave identically.
   *
   * This works because zustand runs subscribers synchronously inside `set()`,
   * which is itself synchronous inside the click handler — so the transient user
   * activation the PiP API requires is still live. Only the 0 -> 1 transition
   * fires, so starting a secondary timer never re-pops the window.
   */
  useEffect(() => {
    if (!autoOpen) {
      return;
    }

    return useTimerStore.subscribe((state, previous) => {
      if (previous.timers.length === 0 && state.timers.length > 0) {
        void openMiniPlayerWindow();
      }
    });
  }, [autoOpen]);

  // Turning the feature off, or losing ownership, closes any open window rather
  // than leaving one behind that nothing controls.
  useEffect(() => {
    if (!prefs.enabled || !isOwner) {
      closeMiniPlayerWindow();
    }
  }, [prefs.enabled, isOwner]);

  // Leaving the app (unmounting the shell) must not orphan the window.
  useEffect(() => () => closeMiniPlayerWindow(), []);

  if (windowState.status !== "open") {
    return null;
  }

  return createPortal(<MiniPlayerSurface pipWindow={windowState.win} />, windowState.mount);
}
