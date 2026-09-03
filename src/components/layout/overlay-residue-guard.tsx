"use client";

import { useEffect } from "react";

import { repairAppHeightIfStale } from "@/lib/ui/app-height";
import { hasSettledOverlays } from "@/lib/ui/overlay-state";

/**
 * Repairs the page after the last overlay closes.
 *
 * Three things can be left behind once a dialog stack unwinds, and all three are
 * invisible until the user tries to click something:
 *
 * 1. A stale `--app-height`. This is the black, un-clickable strip at the bottom
 *    of the window: `<html>` is pinned to a pixel height, so when that value is
 *    smaller than the real window the leftover band is *outside the document*,
 *    painted with the body's background (`<html>` has none of its own) and
 *    hit-testable by nothing. Only a reload used to fix it.
 * 2. An inline `pointer-events: none` on `<body>`. Radix's dismissable-layer
 *    stack normally restores this, but its captured "original" value is a
 *    module global that is `undefined` before the first capture, and assigning
 *    `undefined` to a style property leaves the existing declaration in place
 *    rather than clearing it.
 * 3. A leftover `data-scroll-locked` counter. Harmless to look at here, because
 *    `<body>` is already `overflow-hidden` so the scrollbar gap resolves to
 *    zero, but it used to disable every global keyboard shortcut.
 *
 * Rather than ask every call site to clean up (there are nested dialog roots in
 * the log entry form and the timer card, plus popovers and pickers), this
 * watches `<body>` and sweeps once the stack is empty.
 *
 * Mounted from `AppShell`, not `AppProviders`, so it never runs on the
 * marketing root, which has no shell, no `--app-height` and no dialogs.
 */
export function OverlayResidueGuard() {
  useEffect(() => {
    const body = document.body;
    let frame = 0;
    let secondFrame = 0;

    function sweep() {
      // Re-checked here, not just when the sweep was scheduled: Radix lifts the
      // body's pointer-events asynchronously, so writing while a layer is still
      // open or mid-exit would fight its restore rather than follow it.
      if (!hasSettledOverlays()) return;

      const cleaned: string[] = [];

      if (body.style.pointerEvents === "none") {
        body.style.removeProperty("pointer-events");
        cleaned.push("pointer-events");
      }

      if (body.hasAttribute("data-scroll-locked")) {
        // Safe against a later `react-remove-scroll-bar` cleanup: it parses the
        // missing attribute as 0, and 0 - 1 <= 0 makes its own removal a no-op.
        // Removing the attribute drops the injected overflow/position/margin
        // rule with it, which is why those are not cleared individually.
        body.removeAttribute("data-scroll-locked");
        cleaned.push("data-scroll-locked");
      }

      if (repairAppHeightIfStale()) {
        cleaned.push("--app-height");
      }

      if (cleaned.length > 0 && process.env.NODE_ENV !== "production") {
        // Surfaced rather than silently papered over, so a real leak upstream
        // stays findable.
        console.warn(`[koku] cleaned overlay residue: ${cleaned.join(", ")}`);
      }
    }

    function schedule() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      // Two frames: Radix restores in effect cleanups, and its
      // outside-pointer-down handling defers through a timeout, so one frame
      // can still land mid-teardown.
      frame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(sweep);
      });
    }

    const observer = new MutationObserver(schedule);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "style"],
      // Radix portals mount as direct children of <body>, so this catches every
      // overlay appearing and disappearing without knowing any of them.
      childList: true,
    });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return null;
}
