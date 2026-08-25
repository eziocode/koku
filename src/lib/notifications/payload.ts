import {
  EOD_NOTIFICATION_ACTION_IDS,
  EOD_SNOOZE_MINUTES,
  NOTIFICATION_ACTION_IDS,
  type EodNotificationActionId,
  type KokuNotificationData,
  type NotificationActionId,
} from "@/lib/notifications/messages";
import type { NotificationPreferences } from "@/lib/notifications/settings";
import type { TimeFormat } from "@/lib/settings/schema";

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
  endOfDay: "koku-eod",
  endOfDayDone: "koku-eod-done",
} as const;

export const NOTIFICATION_ICON = "/icon-192.png";

/**
 * The small mark shown beside the source line, not a scaled-down `icon`.
 *
 * Chrome and Android treat `badge` as an alpha mask and re-tint every opaque
 * pixel, so the terracotta-plated app icon this used to point at came out as a
 * flat tinted square with the 刻 lost inside it. `/icon-badge.png` is the glyph
 * alone on transparency — see `badgeSvg` in `scripts/generate-icons.mjs`.
 */
export const NOTIFICATION_BADGE = "/icon-badge.png";

export type CheckInContext =
  | { kind: "timer-running"; timerId: string; title: string; elapsedSec: number }
  | { kind: "timer-paused"; timerId: string; title: string; elapsedSec: number }
  | { kind: "break"; breakId: string; label: string; remainingSec: number | null }
  | { kind: "idle"; lastEntryTitle: string | null; idleForSec: number | null };

export interface BuiltNotification {
  title: string;
  options: NotificationOptions;
  /** Best-effort page-side close; browser still controls OS-level timeout. */
  autoHideAfterMs?: number;
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
    autoHideAfterMs: prefs.checkIn.requireInteraction ? undefined : prefs.checkIn.autoHideMinutes * 60_000,
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

const EOD_ACTION_TITLES: Record<EodNotificationActionId, string> = {
  "eod-stop": "End day",
  "eod-snooze": `+${EOD_SNOOZE_MINUTES} min`,
  "eod-keep": "Skip today",
};

/**
 * The wrap-up prompt fired at the user's configured logoff time.
 *
 * `requireInteraction` keeps it in the tray until the user answers — which also
 * means it outlives every koku tab, so the worker's click handling must not
 * assume a window exists (see `EOD_PARAM`).
 *
 * Buttons are truncated to `maxActions` rather than withheld: the previous
 * version rendered nothing at all below two slots, which left the only sticky
 * notification koku sends with no way to answer it. Where the browser renders no
 * buttons at all, a click on the body counts as "Skip today" — the notification
 * was demonstrably seen, and auto-stopping someone's timers after they engaged
 * with the prompt is the one outcome worth ruling out.
 */
export function buildEndOfDayNotification(
  gracePeriodMinutes: number,
  capabilities: NotificationCapabilities,
  now = Date.now(),
): BuiltNotification {
  const data: KokuNotificationData = {
    kokuType: "end-of-day",
    timerId: null,
    breakId: null,
    createdAt: now,
  };

  const actions: NotificationAction[] =
    capabilities.maxActions > 0
      ? EOD_NOTIFICATION_ACTION_IDS.slice(0, capabilities.maxActions).map((action) => ({
          action,
          title: EOD_ACTION_TITLES[action],
        }))
      : [];

  return {
    title: "Time to wrap up?",
    options: {
      body:
        actions.length > 0
          ? `Your timer is still running. Auto-stops in ${gracePeriodMinutes} min if you don't answer.`
          : `Your timer is still running. Auto-stops in ${gracePeriodMinutes} min — click here to keep it running.`,
      tag: NOTIFICATION_TAGS.endOfDay,
      renotify: true,
      requireInteraction: true,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      actions,
      data,
    },
  };
}

/** Confirms a snooze so the tray does not just go quiet for 15 minutes. */
export function buildEndOfDaySnoozedNotification(
  resumeAt: number,
  now = Date.now(),
  timeFormat: TimeFormat = "12h",
): BuiltNotification {
  const data: KokuNotificationData = {
    kokuType: "end-of-day",
    timerId: null,
    breakId: null,
    createdAt: now,
  };

  const clock = new Date(resumeAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });

  return {
    title: "Snoozed",
    options: {
      body: `koku will ask again at ${clock}. Your timers keep running.`,
      tag: NOTIFICATION_TAGS.endOfDay,
      renotify: false,
      requireInteraction: false,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_BADGE,
      data,
    },
  };
}

/** Confirmation shown after timers are automatically stopped. */
export function buildEndOfDayDoneNotification(now = Date.now()): BuiltNotification {
  const data: KokuNotificationData = {
    kokuType: "end-of-day",
    timerId: null,
    breakId: null,
    createdAt: now,
  };

  return {
    title: "Timers saved",
    options: {
      body: "Your running timers were stopped and saved automatically.",
      tag: NOTIFICATION_TAGS.endOfDayDone,
      renotify: false,
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
    autoHideAfterMs: prefs.checkIn.requireInteraction ? undefined : prefs.checkIn.autoHideMinutes * 60_000,
  };
}
