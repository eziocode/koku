"use client";

import {
  BookOpen,
  Car,
  Coffee,
  Dumbbell,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { type QuickActionIcon, type QuickActionPreset } from "@/lib/notifications/settings";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";

const ICONS: Record<QuickActionIcon, typeof Phone> = {
  Phone,
  Users,
  MessageCircle,
  Mail,
  Coffee,
  Utensils,
  Car,
  Dumbbell,
  BookOpen,
  Sparkles,
};

/**
 * One outline button per configured quick action, modelled on `BreakButton`:
 * a single click pauses running timers and starts a labelled countdown (or an
 * open-ended one when `defaultMinutes` is 0). `BreakCard` already renders
 * whatever break is active, quick action or plain, so this component only
 * needs to start one.
 */
export function QuickActionButtons() {
  const { prefs } = useNotificationPreferences();
  const startBreak = useTimerStore((state) => state.startBreak);

  if (!prefs.quickActions.enabled || !prefs.quickActions.items.length) {
    return null;
  }

  function begin(action: QuickActionPreset) {
    const started = startBreak({
      label: action.label,
      plannedDurationSec: action.defaultMinutes * 60,
      projectId: action.projectId,
      categoryId: action.categoryId,
      tag: action.tag,
    });

    if (!started) {
      toast.error("A break or quick action is already running.");
      return;
    }

    toast.success(
      started.pausedTimerIds.length > 0
        ? `${started.label} started. ${started.pausedTimerIds.length === 1 ? "Your timer is" : "Your timers are"} paused.`
        : `${started.label} started.`,
    );
  }

  return (
    <>
      {prefs.quickActions.items.map((action) => {
        const Icon = ICONS[action.icon] ?? Sparkles;
        return (
          <Button key={action.id} variant="outline" className="gap-2" onClick={() => begin(action)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {action.label}
          </Button>
        );
      })}
    </>
  );
}
