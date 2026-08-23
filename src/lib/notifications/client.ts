import { auditLogger } from "@/lib/audit/logger";
import { postToSw } from "@/lib/notifications/messages";
import type { BuiltNotification } from "@/lib/notifications/payload";
import { detectNotificationSupport, getPermissionState } from "@/lib/notifications/permission";

/**
 * How long to wait for `navigator.serviceWorker.ready`.
 *
 * `ready` is a promise that only ever resolves — it never rejects. If the worker
 * failed to register, or is stuck installing, awaiting it hangs forever, which
 * used to mean a check-in (or the "Send test notification" button) produced no
 * notification, no error, and no audit entry at all. Racing it against a timeout
 * converts that silence into a reportable failure.
 */
const SW_READY_TIMEOUT_MS = 5_000;

/** Why a notification did not appear, for logging and honest UI copy. */
export type ShowFailureReason =
  | "unsupported"
  | "not-granted"
  | "no-service-worker"
  | "show-threw";

export type ShowResult =
  | { shown: true; via: "service-worker" | "constructor" }
  | { shown: false; reason: ShowFailureReason; detail?: string };

async function readyWithinTimeout(): Promise<ServiceWorkerRegistration | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Actually showing a notification.
 *
 * Preferred path is the service worker registration, never `new Notification()`
 * — the constructor silently drops action buttons, which would quietly remove
 * the Quick note affordance that the whole feature is built around.
 *
 * But "no buttons" beats "no notification": if the worker is unavailable the
 * constructor is used as a last resort with `actions` stripped, since passing
 * them to the constructor throws on some engines.
 *
 * Never throws: a failed notification is not worth breaking a render or a
 * scheduler tick over. Callers that want to explain the failure use
 * `showKokuNotificationDetailed`.
 */
export async function showKokuNotificationDetailed(
  built: BuiltNotification,
): Promise<ShowResult> {
  if (!detectNotificationSupport().supported) {
    return { shown: false, reason: "unsupported" };
  }

  if (getPermissionState() !== "granted") {
    return { shown: false, reason: "not-granted" };
  }

  const registration = await readyWithinTimeout();

  if (registration) {
    try {
      await registration.showNotification(built.title, built.options);
      return { shown: true, via: "service-worker" };
    } catch (error) {
      const detail = error instanceof Error ? error.name : "UnknownError";
      auditLogger.event("notifications.show.failed", "runtime", {
        error: detail,
        tag: built.options.tag,
      });
      return { shown: false, reason: "show-threw", detail };
    }
  }

  // Worker never became ready. Degrade to the constructor rather than go silent.
  try {
    const constructorSafe: NotificationOptions = { ...built.options };
    // `actions` is rejected by the constructor on some engines.
    delete constructorSafe.actions;
    new Notification(built.title, constructorSafe);
    auditLogger.event("notifications.show.degraded", "runtime", {
      reason: "sw-not-ready",
      tag: built.options.tag,
    });
    return { shown: true, via: "constructor" };
  } catch (error) {
    const detail = error instanceof Error ? error.name : "UnknownError";
    auditLogger.event("notifications.show.failed", "runtime", {
      error: detail,
      reason: "sw-not-ready",
      tag: built.options.tag,
    });
    return { shown: false, reason: "no-service-worker", detail };
  }
}

/** Boolean convenience wrapper for callers that cannot act on the reason. */
export async function showKokuNotification(built: BuiltNotification): Promise<boolean> {
  return (await showKokuNotificationDetailed(built)).shown;
}

/** Human-readable copy for a failure, for toasts and settings. */
export function explainShowFailure(result: ShowResult): string | null {
  if (result.shown) {
    return null;
  }

  if (result.reason === "unsupported") {
    return "This browser can’t show notifications.";
  }

  if (result.reason === "not-granted") {
    return "Notifications aren’t allowed for koku in this browser.";
  }

  if (result.reason === "no-service-worker") {
    return "koku’s service worker isn’t running, so notifications can’t be delivered. Reload the page and try again.";
  }

  return `The browser refused to show the notification${result.detail ? ` (${result.detail})` : ""}.`;
}

/**
 * Clears notifications with a given tag.
 *
 * Used when the thing a notification was about is no longer true — DND was just
 * enabled, or the timer it was asking about has stopped — so the tray does not
 * hold a stale prompt.
 */
export async function closeKokuNotifications(tag: string): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await readyWithinTimeout();
    if (!registration) {
      postToSw({ source: "koku", type: "close-notifications", tag });
      return;
    }

    const notifications = await registration.getNotifications({ tag });
    for (const notification of notifications) {
      notification.close();
    }
  } catch {
    // Best-effort: also ask the worker, in case this page cannot enumerate them.
    postToSw({ source: "koku", type: "close-notifications", tag });
  }
}
