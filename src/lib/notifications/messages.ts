/**
 * The page ↔ service worker protocol.
 *
 * `public/sw.js` is plain JavaScript and cannot import these types, so this
 * module is the single source of truth for the string literals and
 * `messages.test.ts` asserts that every one of them still appears in the service
 * worker file. That guard exists because the classic failure here is renaming a
 * member of one of these unions and silently breaking the worker.
 */

export const NOTIFICATION_ACTION_IDS = ["quick-note", "open-log", "dismiss"] as const;
export type NotificationActionId = (typeof NOTIFICATION_ACTION_IDS)[number];

/**
 * End-of-day buttons, in the order they are offered.
 *
 * Order is load-bearing: `Notification.maxActions` is 2 on Chrome/Edge desktop
 * and 0 everywhere else, so this list is truncated rather than rejected, and the
 * first two are the ones that reach the user. "End day" and "+15 min" earn those
 * slots because they are the two answers with a consequence; "Skip today" is
 * also what a click on the notification body means, so losing its button costs
 * the user nothing.
 */
export const EOD_NOTIFICATION_ACTION_IDS = ["eod-stop", "eod-snooze", "eod-keep"] as const;
export type EodNotificationActionId = (typeof EOD_NOTIFICATION_ACTION_IDS)[number];

/** How far "+15 min" pushes the wrap-up prompt out. */
export const EOD_SNOOZE_MINUTES = 15;

/** What the page should do once focused. */
export type NotificationIntent = "quick-note" | "open-log";

/**
 * Carries the intent when the worker had to open a brand-new window.
 *
 * A fresh document has no `message` listener at the moment the worker would post
 * to it, so the intent has to survive the navigation in the URL instead.
 */
export const INTENT_PARAM = "koku-intent";

/**
 * Same trick for end-of-day buttons.
 *
 * `requireInteraction` keeps the wrap-up prompt in the tray after every koku tab
 * is gone, so its buttons have to survive being clicked with nothing running:
 * the worker opens a window carrying the answer in the URL, and the scheduler
 * applies it on mount. Without this the notification looks live but silently
 * does nothing — the exact failure this whole path exists to avoid.
 */
export const EOD_PARAM = "koku-eod";

export function isEodActionId(value: unknown): value is EodNotificationActionId {
  return (EOD_NOTIFICATION_ACTION_IDS as readonly string[]).includes(value as string);
}

export type KokuNotificationKind = "check-in" | "break-complete" | "test" | "end-of-day";

export interface KokuNotificationData {
  kokuType: KokuNotificationKind;
  timerId: string | null;
  breakId: string | null;
  createdAt: number;
}

export type PageToSwMessage =
  | { source: "koku"; type: "skip-waiting" }
  | { source: "koku"; type: "ping" }
  | { source: "koku"; type: "close-notifications"; tag: string };

export type SwToPageMessage =
  | {
      source: "koku-sw";
      type: "notification-action";
      action: NotificationIntent;
      tag: string;
      data: KokuNotificationData | null;
    }
  | { source: "koku-sw"; type: "notification-dismissed"; tag: string }
  | { source: "koku-sw"; type: "notification-closed"; tag: string }
  | { source: "koku-sw"; type: "pong" }
  | { source: "koku-sw"; type: "eod-stop-timers" }
  | { source: "koku-sw"; type: "eod-keep-running" }
  | { source: "koku-sw"; type: "eod-snooze" };

export const SW_TO_PAGE_TYPES = [
  "notification-action",
  "notification-dismissed",
  "notification-closed",
  "pong",
  "eod-stop-timers",
  "eod-keep-running",
  "eod-snooze",
] as const;

export const PAGE_TO_SW_TYPES = ["skip-waiting", "ping", "close-notifications"] as const;

export function isNotificationIntent(value: unknown): value is NotificationIntent {
  return value === "quick-note" || value === "open-log";
}

export function isSwToPageMessage(value: unknown): value is SwToPageMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;
  if (message.source !== "koku-sw" || typeof message.type !== "string") {
    return false;
  }

  if (!(SW_TO_PAGE_TYPES as readonly string[]).includes(message.type)) {
    return false;
  }

  if (message.type === "notification-action") {
    return isNotificationIntent(message.action) && typeof message.tag === "string";
  }

  if (
    message.type === "pong" ||
    message.type === "eod-stop-timers" ||
    message.type === "eod-keep-running" ||
    message.type === "eod-snooze"
  ) {
    return true;
  }

  return typeof message.tag === "string";
}

/**
 * Fire-and-forget page → worker message.
 *
 * Deliberately not `navigator.serviceWorker.controller`, which is what this used
 * to be: `controller` is null for any tab that loaded *before* the worker
 * activated, and stays null until that tab is reloaded. Every message from such
 * a tab was silently dropped — which read as "notification settings do nothing
 * in my other tab". `ready.active` is the worker itself and is populated for
 * controlled and uncontrolled clients alike.
 */
export function postToSw(message: PageToSwMessage): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const controller = navigator.serviceWorker.controller;
  if (controller) {
    controller.postMessage(message);
    return;
  }

  void navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage(message))
    .catch(() => undefined);
}
