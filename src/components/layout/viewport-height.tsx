"use client";

import { useEffect } from "react";

import { measureAppHeight, repairAppHeightIfStale } from "@/lib/ui/app-height";

/**
 * Publishes the live viewport height as `--app-height` on `<html>`.
 *
 * The shell is a fixed, non-scrolling layout, so every panel is sized off the
 * viewport. A pure CSS chain (`html/body { height: 100% }`, or `100dvh`) is
 * resolved against the layout viewport, and the browser does not always
 * re-resolve it after the window changes size while the tab was hidden,
 * occluded, or backgrounded: the document keeps the old height and the strip
 * of window past it is dead space — outside the document, so nothing in it can
 * be clicked, and only a hard reload (or a fullscreen toggle, which forces a
 * relayout) restores it.
 *
 * Writing the height as a pixel custom property makes the shell's height a
 * value the app controls, so any of the events below repairs the layout without
 * a reload. `window.innerHeight` is deliberate over `visualViewport.height`:
 * the latter shrinks for pinch zoom and the on-screen keyboard, which would
 * squash the shell mid-typing.
 *
 * `visualViewport`'s resize is still listened to, but strictly as a *trigger*
 * for `repairAppHeightIfStale()` and never as a value: it fires in cases the
 * window-level events miss, and the repair then checks the document against
 * `window.innerHeight` and writes only if they have actually drifted. Overlay
 * close is covered the same way, from `<OverlayResidueGuard />`, rather than by
 * every dialog call site having to remember to re-measure.
 */
export function ViewportHeight() {
  useEffect(() => {
    let frame = 0;

    const apply = measureAppHeight;

    // A tab that has just become visible (or a window that has just been
    // restored) can still report the pre-restore size on the event itself, so
    // the measurement is also taken on the next frame.
    const applySoon = () => {
      apply();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") applySoon();
    };

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", applySoon);
    window.addEventListener("pageshow", applySoon);
    window.addEventListener("focus", applySoon);
    document.addEventListener("visibilitychange", onVisibility);
    // A trigger only: the repair re-checks the document against the window and
    // writes nothing when they already agree, so pinch zoom and the on-screen
    // keyboard cannot squash the shell through this path.
    const onVisualViewport = () => repairAppHeightIfStale();
    window.visualViewport?.addEventListener("resize", onVisualViewport);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", applySoon);
      window.removeEventListener("pageshow", applySoon);
      window.removeEventListener("focus", applySoon);
      document.removeEventListener("visibilitychange", onVisibility);
      window.visualViewport?.removeEventListener("resize", onVisualViewport);
    };
  }, []);

  return null;
}
