import {
  NOTIFICATION_ACTION_IDS,
  type KokuNotificationData,
  type NotificationActionId,
} from "@/lib/notifications/messages";
import type { NotificationPreferences } from "@/lib/notifications/settings";

/**
 * Notification content, built purely so it can be unit-tested.
 *
 * Tags are stable per notification kind so a repeat *replaces* the one already
 * in the tray rather than stacking. That is also the real duplicate-proofing if
 * two tabs ever both fire: leader election is the optimisation, the tag is the
 * guarantee.
 */
export const NOTIFICATION_TAGS = {
  checkIn: "koku-checkin",
  break: "koku-break",
  test: "koku-test",
} as const;

export const NOTIFICATION_ICON = "/icon-192.png";
export const NOTIFICATION_BADGE = "/icon-192.png";

export type CheckInContext =
  | { kind: "timer-running"; timerId: string; title: string; elapsedSec: number }
  | { kind: "timer-paused"; timerId: string; title: string; elapsedSec: number }
  | { kind: "break"; breakId: string; label: string; remainingSec: number | null }
  | { kind: "idle"; lastEntryTitle: string | null; idleForSec: number | null };

export interface BuiltNotification {
  title: string;
  options: NotificationOptions;
}

export interface NotificationCapabilities {
  /** `Notification.maxActions`; 0 on Firefox and Safari, which ignore actions. */
  maxActions: number;
}

const ACTION_TITLES: Record<NotificationActionId, string> = {
  "quick-note": "Quick note",
  "open-log": "Open log",
  dismiss: "Dismiss",
};

function isActionEnabled(
  action: NotificationActionId,
  prefs: NotificationPreferences["checkIn"]["actions"],
): boolean {
  if (action === "quick-note") return prefs.quickNote;
  if (action === "open-log") return prefs.openLog;
  return prefs.dismiss;
}

/**
 * Builds the action buttons in priority order, then truncates to what the
 * browser will actually render.
 *
 * Priority matters because `maxActions` is 2 on Chrome desktop, so with all
 * three enabled the user sees Quick note and Open log — the two that do
 * something — and dismisses via the notification's own close affordance.
 */
export function buildNotificationActions(
  prefs: NotificationPreferences["checkIn"]["actions"],
  capabilities: NotificationCapabilities,
): NotificationAction[] {
  if (capabilities.maxActions <= 0) {
    return [];
  }

  return NOTIFICATION_ACTION_IDS.filter((action) => isActionEnabled(action, prefs))
    .slice(0, capabilities.maxActions)
    .map((action) => ({ action, title: ACTION_TITLES[action] }));
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The recurring check-in.
 *
 * Returns `null` when there is nothing worth saying — currently the idle case
 * with the idle nudge switched off. Keeping that decision here rather than in the
 * scheduler means "should this fire at all" is testable without React.
 */
export function buildCheckInNotification(
  context: CheckInContext,
  prefs: NotificationPreferences,
  capabilities: NotificationCapabilities,
  now = Date.now(),
): BuiltNotification | null {
  if (context.kind === "idle" && !prefs.checkIn.notifyWhenIdle) {
    return null;
  }

  let title: string;
  let body: string;
  let timerId: string | null = null;
  let breakId: string | null = null;

  if (context.kind === "timer-running") {
    timerId = context.timerId;
    title = `Still on “${context.title}”`;
    body = `${formatElapsed(context.elapsedSec)} tracked — anything worth recording?`;
  } else if (context.kind === "timer-paused") {
    timerId = context.timerId;
    title = `Paused on “${context.title}”`;
    body = `${formatElapsed(context.elapsedSec)} tracked. Pick it back up, or log what happened?`;
  } else if (context.kind === "break") {
    breakId = context.breakId;
    title = `On a ${context.label.toLowerCase()}`;
    body =
      context.remainingSec === null
        ? "Still on a break. Ready to get back to it?"
        : `${Math.ceil(context.remainingSec / 60)}m left.`;
  } else {
    title = "No timer running";
    body = context.lastEntryTitle
      ? `Nothing tracked since “${context.lastEntryTitle}”. Start one?`
      : "Nothing is being tracked right now. Start a timer?";
  }

  const data: KokuNotificationData = {
    kokuType: "check-in",
    timerId,
    breakId,
    createdAt: now,
  };

  return {
    title,
    options: {
      body,
      tag: NOTIFICATION_TAGS.checkIn,
      renotify: true,
      requireInteraction: prefs.checkIn.requireInteraction,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      actions: buildNotificationActions(prefs.checkIn.actions, capabilities),
      data,
    },
  };
}

export function buildBreakCompleteNotification(
  label: string,
  elapsedSec: number,
  now = Date.now(),
): BuiltNotification {
  const data: KokuNotificationData = {
    kokuType: "break-complete",
    timerId: null,
    breakId: null,
    createdAt: now,
  };

  return {
    title: `${label} finished`,
    options: {
      body: `${formatElapsed(elapsedSec)} logged. Your timers are running again.`,
      tag: NOTIFICATION_TAGS.break,
      renotify: true,
      // Never sticky: a finished break is information, not a task.
      requireInteraction: false,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data,
    },
  };
}

/** Lets the user verify delivery and action support in one click. */
export function buildTestNotification(
  prefs: NotificationPreferences,
  capabilities: NotificationCapabilities,
  now = Date.now(),
): BuiltNotification {
  const data: KokuNotificationData = {
    kokuType: "test",
    timerId: null,
    breakId: null,
    createdAt: now,
  };

  return {
    title: "Koku check-in",
    options: {
      body:
        capabilities.maxActions > 0
          ? "This is what a check-in looks like. Try the buttons."
          : "This is what a check-in looks like. This browser shows no buttons, so click the notification body.",
      tag: NOTIFICATION_TAGS.test,
      renotify: true,
      requireInteraction: prefs.checkIn.requireInteraction,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      actions: buildNotificationActions(prefs.checkIn.actions, capabilities),
      data,
    },
  };
}
