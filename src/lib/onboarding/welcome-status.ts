import type { NotificationPreferences } from "@/lib/notifications/settings";
import type { PermissionState } from "@/lib/notifications/permission";
import type { OnboardingState } from "@/lib/onboarding/settings";

export type WelcomeStep = "displayName" | "weekOff" | "logoff" | "notifications";

export interface WelcomeStatus {
  displayName: boolean;
  weekOff: boolean;
  logoff: boolean;
  notifications: boolean;
}

export function getWelcomeStatus(
  displayName: string,
  prefs: NotificationPreferences,
  onboarding: OnboardingState,
  permission: PermissionState,
): WelcomeStatus {
  return {
    displayName: displayName.trim().length > 0,
    // Empty silentDays needs an explicit marker. Non-empty legacy values are
    // unambiguous and count as configured.
    weekOff: onboarding.weekOffSetAt !== null || prefs.silentDays.length > 0,
    logoff: onboarding.endOfDaySetAt !== null,
    notifications:
      onboarding.notificationsSetAt !== null ||
      (permission === "granted" && prefs.enabled),
  };
}

export function firstIncompleteWelcomeStep(status: WelcomeStatus): WelcomeStep | null {
  if (!status.displayName) return "displayName";
  if (!status.weekOff) return "weekOff";
  if (!status.logoff) return "logoff";
  if (!status.notifications) return "notifications";
  return null;
}

