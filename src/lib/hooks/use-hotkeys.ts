"use client";

import { useEffect, useRef } from "react";

import { hasOpenOverlay } from "@/lib/ui/overlay-state";
import { isEditableTarget, resolveShortcut, type ShortcutId } from "@/lib/ui/shortcuts";

const CHORD_TIMEOUT_MS = 1500;

export type ShortcutHandlers = Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>;

/**
 * Global keyboard shortcut dispatcher — one `keydown` listener for the whole
 * app, driven by the pure matching engine in `lib/ui/shortcuts.ts`. Ignores
 * editable targets, IME composition, and open dialogs/popovers so bare-key
 * bindings (`t`, `b`, `n`, `g`…) stay safe to use anywhere in the app.
 *
 * Owns the chord timeout (a `g` leader with no follow-up key expires after
 * `CHORD_TIMEOUT_MS`) — the pure engine only decides what a single keystroke
 * does given the currently pending leader; it has no concept of time.
 */
export function useHotkeys(handlers: ShortcutHandlers, options?: { enabled?: boolean }) {
  const handlersRef = useRef(handlers);

  // Refs must not be written during render (React Compiler flags it), so the
  // latest handler map is synced in an effect rather than inline above.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let pendingLeader: string | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function clearPending() {
      pendingLeader = null;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || isEditableTarget(event.target)) {
        return;
      }

      // Stay out of the way while a dialog, menu or popover owns the keyboard.
      // Deliberately a live DOM read of the open layers rather than
      // `body[data-scroll-locked]`: that attribute is set by any layer mounting
      // `RemoveScroll` (including non-modal popovers, which should not suppress
      // shortcuts), and if it is ever left behind it would disable every
      // shortcut in the app until a reload.
      if (hasOpenOverlay()) {
        return;
      }

      const { matchedId, nextPendingLeader } = resolveShortcut(event, pendingLeader);

      if (nextPendingLeader !== pendingLeader) {
        clearPending();
        if (nextPendingLeader) {
          pendingLeader = nextPendingLeader;
          timeoutId = setTimeout(clearPending, CHORD_TIMEOUT_MS);
        }
      }

      if (!matchedId) {
        return;
      }

      const handler = handlersRef.current[matchedId as ShortcutId];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPending();
    };
  }, [enabled]);
}
