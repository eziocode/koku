"use client";

import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { NotificationIntentReader } from "@/components/notifications/notification-intent-reader";
import {
  QuickNoteComposer,
  type QuickNoteTarget,
} from "@/components/notifications/quick-note-composer";
import { closeKokuNotifications } from "@/lib/notifications/client";
import { isSwToPageMessage, type NotificationIntent } from "@/lib/notifications/messages";
import { NOTIFICATION_TAGS } from "@/lib/notifications/payload";
import { getActiveTimerElapsedSec, useTimerStore } from "@/lib/stores/timer-store";
import type { ActiveBreak, ActiveTimer } from "@/lib/stores/timer-types";

/**
 * Derives what a quick note should attach to.
 *
 * Precedence break > running > paused mirrors `deriveCheckInContext`, so the
 * composer talks about the same thing the notification did.
 */
function deriveQuickNoteTarget(
  timers: ActiveTimer[],
  activeBreak: ActiveBreak | null,
): QuickNoteTarget {
  if (activeBreak && !activeBreak.completedAt) {
    return { kind: "break", label: activeBreak.label, tag: activeBreak.tag };
  }

  const running = timers.filter((timer) => !timer.pausedAt);
  const chosen =
    running.find((timer) => !timer.parentTimerId) ??
    running[0] ??
    timers.find((timer) => !timer.parentTimerId) ??
    timers[0];

  if (chosen) {
    return {
      kind: "timer",
      timerId: chosen.id,
      title: chosen.title,
      elapsedSec: getActiveTimerElapsedSec(chosen),
    };
  }

  return { kind: "standalone" };
}

/**
 * Turns notification actions into UI.
 *
 * Mounted globally in `AppShell`, beside `CommandPalette`, so it is reachable
 * from any route without remounting.
 *
 * There are two delivery paths and both are needed: if a koku window already
 * exists the service worker focuses it and posts a message here; if none did, the
 * worker opened one and the intent arrives in the URL instead (see
 * `NotificationIntentReader`).
 */
export function NotificationCenter() {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);

  const timers = useTimerStore((state) => state.timers);
  const activeBreak = useTimerStore((state) => state.activeBreak);
  const target = deriveQuickNoteTarget(timers, activeBreak);

  const handleIntent = useCallback(
    (intent: NotificationIntent) => {
      if (intent === "quick-note") {
        setComposerOpen(true);
        return;
      }

      router.push("/log");
    },
    [router],
  );

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      // This channel is shared with extensions and other libraries, so validate
      // rather than trusting the shape of whatever arrives.
      if (!isSwToPageMessage(event.data)) {
        return;
      }

      if (event.data.type === "notification-action") {
        handleIntent(event.data.action);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [handleIntent]);

  return (
    <>
      <Suspense fallback={null}>
        <NotificationIntentReader onIntent={handleIntent} />
      </Suspense>
      <QuickNoteComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        target={target}
        onSaved={() => {
          // The check-in that prompted this has been answered, so clear it from
          // the tray rather than leaving a stale prompt sitting there.
          void closeKokuNotifications(NOTIFICATION_TAGS.checkIn);
        }}
      />
    </>
  );
}
