"use client";

import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import type { DndMode, NotificationPreferences } from "@/lib/notifications/settings";

/**
 * The single entry point for notification preferences.
 *
 * Every consumer — scheduler, break runner, topbar DND pill, settings page,
 * mini player — reads through this hook rather than touching the settings table,
 * so there is one narrowing site and one place to change if the shape moves.
 */
export function useNotificationPreferences() {
  const { value, setValue, patchValue, reset } = useTypedSetting("notifications");

  async function setDnd(mode: DndMode, untilIso: string | null = null) {
    await patchValue({ dnd: { mode, untilIso } });
  }

  return {
    prefs: value as NotificationPreferences,
    setPrefs: setValue,
    patch: patchValue,
    setDnd,
    reset,
  };
}

export function useMiniPlayerPreferences() {
  const { value, patchValue, reset } = useTypedSetting("miniPlayer");
  return { prefs: value, patch: patchValue, reset };
}
