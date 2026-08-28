import type { KokuNotificationData } from "@/lib/notifications/messages";
import type { BuiltNotification } from "@/lib/notifications/payload";
import { kokuDb, type NotificationLogEntry } from "@/lib/storage/db";

/**
 * Caps the bell icon's history the same way `MAX_HOLIDAY_DATES` caps holidays
 * — an append-only local log needs a ceiling somewhere, and 50 is generous
 * for something surfaced in a small popover.
 */
export const MAX_NOTIFICATION_LOG_ENTRIES = 50;

/**
 * Appends one entry to the local notification history, called from
 * `showKokuNotificationDetailed` right after a notification is actually
 * shown. Kept as a standalone function (not a hook) since that call site is
 * plain browser code, not a React component.
 */
export async function recordNotificationHistory(built: BuiltNotification): Promise<void> {
  const data = built.options.data as KokuNotificationData | undefined;

  const entry: NotificationLogEntry = {
    id: crypto.randomUUID(),
    title: built.title,
    body: typeof built.options.body === "string" ? built.options.body : "",
    tag: typeof built.options.tag === "string" ? built.options.tag : null,
    kokuType: data?.kokuType ?? null,
    createdAt: new Date().toISOString(),
    readAt: null,
  };

  await kokuDb.transaction("rw", kokuDb.notificationLog, async () => {
    await kokuDb.notificationLog.add(entry);

    const count = await kokuDb.notificationLog.count();
    const excess = count - MAX_NOTIFICATION_LOG_ENTRIES;
    if (excess > 0) {
      const oldest = await kokuDb.notificationLog.orderBy("createdAt").limit(excess).toArray();
      await kokuDb.notificationLog.bulkDelete(oldest.map((row) => row.id));
    }
  });
}
