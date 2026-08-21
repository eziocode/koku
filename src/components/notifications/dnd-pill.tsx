"use client";

import { BellOff } from "lucide-react";
import { useEffect, useState } from "react";

import { DndMenu } from "@/components/notifications/dnd-menu";
import { Button } from "@/components/ui/button";
import { formatDndRemaining, resolveDnd } from "@/lib/notifications/dnd";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";

/** Coarse: the label is minute-granular, so there is nothing to gain from 1s. */
const REFRESH_MS = 30_000;

/**
 * The always-visible reminder that koku is muted.
 *
 * Rendered only while DND is actually on. That is the whole point: the failure
 * mode of a mute switch is forgetting it is on and wondering why nothing ever
 * happens, so when it is on it is impossible to miss, and when it is off it takes
 * up no space at all.
 */
export function DndPill() {
  const { prefs } = useNotificationPreferences();
  const [now, setNow] = useState(() => Date.now());

  const state = resolveDnd(prefs.dnd, now);
  const showing = state.active;

  useEffect(() => {
    if (!showing) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [showing]);

  if (!showing) {
    return null;
  }

  return (
    <DndMenu>
      <Button
        variant="ghost"
        className="min-h-11 gap-2 rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground"
        aria-label="Do not disturb is on. Change or turn off."
      >
        <BellOff className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Do not disturb</span>
        <span aria-live="polite" className="tabular-nums">
          {formatDndRemaining(state, now)}
        </span>
      </Button>
    </DndMenu>
  );
}
