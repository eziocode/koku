"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared 1-second clock for the whole tab.
 *
 * Before this, every surface that showed elapsed time ran its own interval —
 * and because `/log` and `/dashboard` each mount `<Timer />`, that meant
 * duplicate intervals doing identical work whose ticks could land on different
 * milliseconds, so two clocks on screen could disagree by a second.
 *
 * The interval only exists while something is subscribed, and the first tick is
 * aligned to the next whole second so every clock flips together.
 */

const listeners = new Set<() => void>();
let now = Date.now();
let intervalId: ReturnType<typeof setInterval> | null = null;
let alignTimeoutId: ReturnType<typeof setTimeout> | null = null;

function emit() {
  now = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function start() {
  if (intervalId !== null || alignTimeoutId !== null) {
    return;
  }

  // Align to the next whole second so the displayed digits change on the second.
  alignTimeoutId = setTimeout(() => {
    alignTimeoutId = null;
    emit();
    intervalId = setInterval(emit, 1_000);
  }, 1_000 - (Date.now() % 1_000));
}

function stop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (alignTimeoutId !== null) {
    clearTimeout(alignTimeoutId);
    alignTimeoutId = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
    }
  };
}

function getSnapshot() {
  return now;
}

/**
 * Stable during server render so hydration cannot mismatch. The first client
 * tick corrects it, and elapsed values are derived from timestamps anyway.
 */
function getServerSnapshot() {
  return 0;
}

/** Forces an immediate tick — used on focus/visibility change after a sleep. */
export function resyncTicker() {
  emit();
}

/** Current epoch ms, re-rendering the caller once per second. */
export function useSecondTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
