import { auditLogger } from "@/lib/audit/logger";
import { postToSw } from "@/lib/notifications/messages";
import type { BuiltNotification } from "@/lib/notifications/payload";
import { detectNotificationSupport, getPermissionState } from "@/lib/notifications/permission";

/**
 * Actually showing a notification.
 *
 * Always via the service worker registration, never `new Notification()` — the
 * constructor silently drops action buttons, which would quietly remove the
 * Quick note affordance that the whole feature is built around.
 *
 * Returns a boolean instead of throwing: a failed notification is never worth
 * breaking a render or a scheduler tick over.
 */
export async function showKokuNotification(built: BuiltNotification): Promise<boolean> {
  if (!detectNotificationSupport().supported || getPermissionState() !== "granted") {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(built.title, built.options);
    return true;
  } catch (error) {
    auditLogger.event("notifications.show.failed", "runtime", {
      error: error instanceof Error ? error.name : "UnknownError",
      tag: built.options.tag,
    });
    return false;
  }
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
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag });
    for (const notification of notifications) {
      notification.close();
    }
  } catch {
    // Best-effort: also ask the worker, in case this page cannot enumerate them.
    postToSw({ source: "koku", type: "close-notifications", tag });
  }
}
