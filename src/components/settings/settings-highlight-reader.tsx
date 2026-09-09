"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HIGHLIGHT_PARAM, isSettingsAnchorId } from "@/lib/settings/registry";

/** How long to keep looking for the control before giving up silently. */
const FIND_TIMEOUT_MS = 4000;
/** Matches the `koku-setting-flash` animation duration in globals.css. */
const HIGHLIGHT_MS = 1800;

/**
 * Scrolls to and flashes the control named by `?highlight=`, then strips the
 * param.
 *
 * A query param rather than a `#hash` because native hash scrolling fires once,
 * before a leaf page has loaded its preferences out of Dexie, and never retries.
 *
 * Lives in the settings layout so it covers every settings route, and is its own
 * component because `useSearchParams` opts its subtree out of prerendering — see
 * `notification-intent-reader.tsx` for the same trade-off.
 */
export function SettingsHighlightReader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const target = searchParams.get(HIGHLIGHT_PARAM);

  const [request, setRequest] = useState<{ id: string; nonce: number } | null>(null);
  const nonce = useRef(0);

  // Read, latch, strip. The latch is what makes the split below necessary: the
  // `router.replace` re-runs this effect, so anything asynchronous living here
  // would be cancelled by its own cleanup a frame later.
  useEffect(() => {
    if (!target) {
      return;
    }

    if (isSettingsAnchorId(target)) {
      nonce.current += 1;
      setRequest({ id: target, nonce: nonce.current });
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete(HIGHLIGHT_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [target, searchParams, pathname, router]);

  // Find, scroll, flash. Keyed on the latched request alone, so stripping the
  // param cannot interrupt it.
  useEffect(() => {
    if (!request) {
      return;
    }

    const { id } = request;
    let frame = 0;
    let timer = 0;
    let cancelled = false;
    let row: HTMLElement | null = null;

    // The control may not exist yet, or ever: `notifications-enabled` only
    // renders once the browser has granted permission. Retry until a deadline,
    // then stop without complaining.
    const deadline = performance.now() + FIND_TIMEOUT_MS;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function attempt() {
      if (cancelled) {
        return;
      }

      const el = document.getElementById(id);
      if (!el) {
        if (performance.now() < deadline) {
          frame = requestAnimationFrame(attempt);
        }
        return;
      }

      // Flash the whole row: a bare Switch is a 20px box and reads as nothing.
      row = el.closest<HTMLElement>("[data-setting-row]") ?? el;
      row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      row.setAttribute("data-setting-highlight", "");
      // Move focus too, so the highlight is not purely visual. Plenty of
      // settings are inert until their master switch is on, and a disabled
      // control cannot take focus — the flash is the whole affordance there.
      if (!el.hasAttribute("disabled") && !el.closest("fieldset[disabled]")) {
        el.focus({ preventScroll: true });
      }
      timer = window.setTimeout(
        () => row?.removeAttribute("data-setting-highlight"),
        HIGHLIGHT_MS,
      );
    }

    frame = requestAnimationFrame(attempt);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      row?.removeAttribute("data-setting-highlight");
    };
  }, [request]);

  return null;
}
