import assert from "node:assert/strict";
import test from "node:test";

import { NOTIFICATION_DEFAULTS, type NotificationPreferences } from "@/lib/notifications/settings";
import { ONBOARDING_DEFAULTS, type OnboardingState } from "@/lib/onboarding/settings";
import { firstIncompleteWelcomeStep, getWelcomeStatus } from "@/lib/onboarding/welcome-status";

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...NOTIFICATION_DEFAULTS, ...overrides };
}

function onboarding(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return { ...ONBOARDING_DEFAULTS, ...overrides };
}

test("welcome status requires explicit no-week-off choice", () => {
  const status = getWelcomeStatus("Alex", prefs(), onboarding(), "granted");
  assert.equal(status.weekOff, false);
  assert.equal(firstIncompleteWelcomeStep(status), "weekOff");

  const complete = getWelcomeStatus(
    "Alex",
    prefs({ enabled: false }),
    onboarding({
      weekOffSetAt: "2026-01-01T00:00:00.000Z",
      endOfDaySetAt: "2026-01-01T00:00:00.000Z",
      notificationsSetAt: "2026-01-01T00:00:00.000Z",
    }),
    "granted",
  );
  assert.equal(firstIncompleteWelcomeStep(complete), null);
});

test("legacy non-empty week-off and enabled notifications count as configured", () => {
  const status = getWelcomeStatus(
    "Alex",
    prefs({ enabled: true, silentDays: [0, 6] }),
    onboarding({ endOfDaySetAt: "2026-01-01T00:00:00.000Z" }),
    "granted",
  );
  assert.deepEqual(status, { displayName: true, weekOff: true, logoff: true, notifications: true });
});

test("empty profile name remains mandatory even after previous onboarding", () => {
  const status = getWelcomeStatus(
    "   ",
    prefs({ enabled: true }),
    onboarding({
      displayNameSetAt: "2026-01-01T00:00:00.000Z",
      weekOffSetAt: "2026-01-01T00:00:00.000Z",
      endOfDaySetAt: "2026-01-01T00:00:00.000Z",
      notificationsSetAt: "2026-01-01T00:00:00.000Z",
    }),
    "granted",
  );
  assert.equal(firstIncompleteWelcomeStep(status), "displayName");
});
