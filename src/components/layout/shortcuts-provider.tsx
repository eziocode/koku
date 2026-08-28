"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CommandPalette } from "@/components/layout/command-palette";
import { ShortcutsDialog } from "@/components/layout/shortcuts-dialog";
import { toast } from "@/components/ui/toast";
import { useHotkeys, type ShortcutHandlers } from "@/lib/hooks/use-hotkeys";
import { closeKokuNotifications } from "@/lib/notifications/client";
import { NOTIFICATION_TAGS } from "@/lib/notifications/payload";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useNotes } from "@/lib/storage/hooks/use-notes";
import { useTimerStore } from "@/lib/stores/timer-store";
import { startQuickTimer } from "@/lib/time-tracking/quick-timer";

const NAV_SHORTCUT_HREF: Record<string, string> = {
  "nav-dashboard": "/dashboard",
  "nav-log": "/log",
  "nav-tasks": "/tasks",
  "nav-notes": "/notes",
  "nav-reports": "/reports",
  "nav-ai": "/ai",
  "nav-settings": "/settings",
};

/**
 * Mounted once in `AppShell`, route-independently — the single place that
 * turns keyboard shortcut ids (see `lib/ui/shortcuts.ts`) into real app
 * actions, and owns both the command palette's and the `?` help dialog's
 * open state so there is exactly one global `keydown` listener.
 */
export function ShortcutsProvider() {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { timers, activeBreak, startTimer, stopTimer, startBreak } = useTimerStore();
  const { prefs, setDnd } = useNotificationPreferences();
  const { createNote } = useNotes();

  function toggleTimer() {
    if (timers.length > 0) {
      stopTimer(timers[0].id);
      toast.success("Timer stopped.");
      return;
    }

    const result = startQuickTimer({
      timers,
      activeBreak,
      blockNewTimers: prefs.breaks.blockNewTimers,
      startTimer,
    });

    if (result.status !== "started") {
      toast.error(result.message);
      return;
    }

    toast.success("Timer started.");
  }

  function beginBreak() {
    if (!prefs.breaks.enabled) {
      toast.error("Turn on breaks in Settings → Notifications → Breaks first.");
      return;
    }

    const minutes = prefs.breaks.defaultMinutes || prefs.breaks.presetMinutes[0] || 5;
    const started = startBreak({ label: "Break", plannedDurationSec: minutes * 60 });

    if (!started) {
      toast.error("A break is already running.");
      return;
    }

    toast.success(`Break started (${minutes} min).`);
  }

  async function quickNote() {
    const note = await createNote({
      title: "Quick note",
      tags: ["quick"],
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    router.push(`/notes?id=${note.id}`);
  }

  async function toggleDnd() {
    const turningOn = prefs.dnd.mode === "off";
    await setDnd(turningOn ? "indefinite" : "off", null);

    // Mirrors `DndMenu`: a check-in already sitting in the tray contradicts
    // having just asked for silence, so clear it rather than leaving it.
    if (turningOn) {
      void closeKokuNotifications(NOTIFICATION_TAGS.checkIn);
    }

    toast.success(turningOn ? "Do not disturb is on until you turn it off." : "Do not disturb is off.");
  }

  const navHandlers = Object.fromEntries(
    Object.entries(NAV_SHORTCUT_HREF).map(([id, href]) => [id, () => router.push(href)]),
  ) as ShortcutHandlers;

  useHotkeys({
    ...navHandlers,
    help: () => setHelpOpen((current) => !current),
    "command-palette": () => setPaletteOpen((current) => !current),
    "toggle-timer": toggleTimer,
    "start-break": beginBreak,
    "quick-note": () => void quickNote(),
    "toggle-dnd": () => void toggleDnd(),
  });

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
