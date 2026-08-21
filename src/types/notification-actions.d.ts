/**
 * Ambient augmentation for notification action buttons.
 *
 * `NotificationOptions` in TypeScript 5.9's `lib.dom.d.ts` (line ~1252) and
 * `lib.webworker.d.ts` (line ~568) both omit `actions`, even though the
 * Notifications API has supported it for years via
 * `ServiceWorkerRegistration.showNotification()`. Without this, koku's check-in
 * notification (which carries Quick note / Open log / Dismiss buttons) does not
 * typecheck.
 *
 * Interfaces merge, so declaring them again here only adds members. We
 * deliberately do NOT redeclare the `Notification` *variable* — lib.dom already
 * does, and a second `declare var` with a different type is a hard error.
 * `Notification.maxActions` is therefore read through a narrow cast in
 * `src/lib/notifications/permission.ts`.
 *
 * Note that `actions` are ignored entirely by Firefox and Safari, where
 * `maxActions` is 0 — see `src/lib/notifications/payload.ts`, which slices the
 * array to `maxActions` so those browsers degrade to a plain body click.
 */
interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

interface NotificationOptions {
  actions?: NotificationAction[];
  /** Re-alert when a notification replaces an existing one with the same tag. */
  renotify?: boolean;
}

interface Notification {
  readonly actions: ReadonlyArray<NotificationAction>;
}
