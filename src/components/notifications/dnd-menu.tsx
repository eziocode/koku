"use client";

import { BellOff } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { closeKokuNotifications } from "@/lib/notifications/client";
import {
  computeDndUntilIso,
  DND_DURATIONS,
  dndModeForDuration,
  type DndDurationId,
} from "@/lib/notifications/dnd";
import { NOTIFICATION_TAGS } from "@/lib/notifications/payload";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";

interface DndMenuProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
}

/**
 * Do-not-disturb duration picker.
 *
 * Reusable by design: the topbar pill, the settings card, and later the mini
 * player all render it with their own trigger.
 */
export function DndMenu({ children, align = "end" }: DndMenuProps) {
  const { prefs, setDnd } = useNotificationPreferences();
  const active = prefs.dnd.mode !== "off";

  async function choose(duration: DndDurationId) {
    const resumeMinute = prefs.quietHours.enabled ? prefs.quietHours.endMinute : undefined;
    const untilIso = computeDndUntilIso(duration, new Date(), resumeMinute);

    await setDnd(dndModeForDuration(duration), untilIso);

    // A check-in already sitting in the tray contradicts having just asked for
    // silence, so clear it rather than leaving it there.
    void closeKokuNotifications(NOTIFICATION_TAGS.checkIn);

    toast.success(
      duration === "indefinite"
        ? "Do not disturb is on until you turn it off."
        : `Do not disturb is on ${DND_DURATIONS.find((entry) => entry.id === duration)?.label.toLowerCase()}.`,
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        {DND_DURATIONS.map((duration) => (
          <DropdownMenuItem key={duration.id} onSelect={() => void choose(duration.id)}>
            <BellOff className="h-4 w-4" aria-hidden="true" />
            {duration.label}
          </DropdownMenuItem>
        ))}
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void setDnd("off", null);
                toast.success("Do not disturb is off.");
              }}
            >
              Turn off
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
