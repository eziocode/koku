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

export const EOD_NOTIFICATION_ACTION_IDS = ["eod-stop", "eod-keep"] as const;
export type EodNotificationActionId = (typeof EOD_NOTIFICATION_ACTION_IDS)[number];

/** What the page should do once focused. */
export type NotificationIntent = "quick-note" | "open-log";

/**
 * Carries the intent when the worker had to open a brand-new window.
 *
 * A fresh document has no `message` listener at the moment the worker would post
 * to it, so the intent has to survive the navigation in the URL instead.
 */
export const INTENT_PARAM = "koku-intent";

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
  | { source: "koku-sw"; type: "eod-keep-running" };

export const SW_TO_PAGE_TYPES = [
  "notification-action",
  "notification-dismissed",
  "notification-closed",
  "pong",
  "eod-stop-timers",
  "eod-keep-running",
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

  if (message.type === "pong" || message.type === "eod-stop-timers" || message.type === "eod-keep-running") {
    return true;
  }

  return typeof message.tag === "string";
}

/** Fire-and-forget; silently does nothing when no worker controls the page. */
export function postToSw(message: PageToSwMessage): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.controller?.postMessage(message);
}
