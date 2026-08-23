"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { MiniPlayerSurface } from "@/components/mini-player/mini-player-surface";
import { useMiniPlayerPreferences } from "@/lib/notifications/use-notification-preferences";
import { armAutoOpen } from "@/lib/mini-player/auto-open";
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
  const autoOpenOnTabSwitch = prefs.enabled && prefs.autoOpenOnTabSwitch && isOwner;

  /* Set only when *we* opened the window because the tab was hidden, so coming
     back closes that window and never one the user popped out deliberately. */
  const openedByTabSwitchRef = useRef(false);

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

  /**
   * Follow the user out of the tab, and fold away when they return.
   *
   * Gated on something actually being tracked: an auto-opened window showing
   * "No timer running" is pure noise, and it is the one case where the mini
   * player can legitimately look empty.
   */
  useEffect(() => {
    if (!autoOpenOnTabSwitch) {
      return;
    }

    const isLive = () => {
      const { timers, activeBreak } = useTimerStore.getState();
      return timers.length > 0 || Boolean(activeBreak && !activeBreak.completedAt);
    };

    const disarm = armAutoOpen(() => {
      if (getMiniPlayerWindowState().status !== "closed" || !isLive()) {
        return false;
      }

      openedByTabSwitchRef.current = true;
      return true;
    });

    const onVisible = () => {
      if (document.visibilityState !== "visible" || !openedByTabSwitchRef.current) {
        return;
      }

      openedByTabSwitchRef.current = false;
      closeMiniPlayerWindow();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disarm();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoOpenOnTabSwitch]);

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
