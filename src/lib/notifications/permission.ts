/**
 * Notification capability and permission probing.
 *
 * Kept separate from the React layer so the "can we even do this" question has
 * one answer, and so the honest-UI copy in settings can be driven by a real
 * capability check rather than a browser sniff.
 */

export type NotificationSupport =
  | {
      supported: false;
      reason: "no-notification-api" | "no-service-worker" | "no-sw-notifications";
      maxActions: 0;
      supportsActions: false;
    }
  | { supported: true; maxActions: number; supportsActions: boolean };

/**
 * `Notification.maxActions` is a static member that TypeScript's DOM lib does
 * not declare, so it is read through a narrow cast rather than by redeclaring
 * the `Notification` variable (which would collide with lib.dom).
 *
 * It is 2 on Chrome/Edge desktop and absent on Firefox and Safari, which ignore
 * the `actions` member entirely — hence the 0 fallback, which callers use to
 * degrade to a plain body click.
 */
function readMaxActions(): number {
  const value = (Notification as unknown as { maxActions?: unknown }).maxActions;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function detectNotificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { supported: false, reason: "no-notification-api", maxActions: 0, supportsActions: false };
  }

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, reason: "no-service-worker", maxActions: 0, supportsActions: false };
  }

  // Action buttons require showNotification() on the registration; the
  // Notification constructor cannot render them.
  if (
    typeof ServiceWorkerRegistration === "undefined" ||
    !("showNotification" in ServiceWorkerRegistration.prototype)
  ) {
    return { supported: false, reason: "no-sw-notifications", maxActions: 0, supportsActions: false };
  }

  const maxActions = readMaxActions();
  return { supported: true, maxActions, supportsActions: maxActions > 0 };
}

export type PermissionState = NotificationPermission | "unsupported";

export function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

/**
 * Requests permission.
 *
 * MUST be called from a user gesture: Safari enforces it outright and Chrome
 * strongly prefers it, and Chrome permanently blocks an origin after repeated
 * dismissals — so this is never called from an effect, only from a button.
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function explainUnsupported(support: NotificationSupport): string | null {
  if (support.supported) {
    return null;
  }

  if (support.reason === "no-notification-api") {
    return "This browser doesn't support notifications.";
  }

  if (support.reason === "no-service-worker") {
    return "This browser doesn't support service workers, which koku needs to show notifications.";
  }

  return "This browser can't show notifications from a service worker, which is how koku delivers check-ins.";
}
