import type { NotificationPreferences } from "@/lib/notifications/settings";
import type { PermissionState } from "@/lib/notifications/permission";
import type { OnboardingState } from "@/lib/onboarding/settings";

export type WelcomeStep = "displayName" | "weekOff" | "logoff" | "notifications";

// This was previously used as an account-form placeholder. Treat it as empty
// for old local profiles, so placeholder text never satisfies mandatory setup.
const DEFAULT_PROFILE_NAME = "koku user";

function hasRealDisplayName(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized.length > 0 && normalized !== DEFAULT_PROFILE_NAME;
}

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
    displayName: hasRealDisplayName(displayName),
    // Empty silentDays needs an explicit marker. Non-empty legacy values are
    // unambiguous and count as configured.
    weekOff: onboarding.weekOffSetAt !== null || prefs.silentDays.length > 0,
    // Timestamp alone is not enough: old/corrupt rows can claim setup finished
    // while preference still contains the built-in 18:00 value.
    logoff:
      onboarding.endOfDaySetAt !== null &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.endOfDay.logoffTime),
    notifications:
      permission === "granted" &&
      (onboarding.notificationsSetAt !== null || prefs.enabled),
  };
}

export function firstIncompleteWelcomeStep(status: WelcomeStatus): WelcomeStep | null {
  if (!status.displayName) return "displayName";
  if (!status.weekOff) return "weekOff";
  if (!status.logoff) return "logoff";
  if (!status.notifications) return "notifications";
  return null;
}
