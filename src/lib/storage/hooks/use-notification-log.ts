"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb, type NotificationLogEntry } from "@/lib/storage/db";

const EMPTY_LOG: NotificationLogEntry[] = [];

/**
 * Backs the topbar bell icon. Newest first, purely local (see the comment on
 * `NotificationLogEntry` in `storage/db.ts`) — nothing here participates in
 * cloud sync.
 */
export function useNotificationLog() {
  const entries = useLiveQuery(
    () => kokuDb.notificationLog.orderBy("createdAt").reverse().toArray(),
    [],
    EMPTY_LOG,
  );

  const unreadCount = entries.filter((entry) => !entry.readAt).length;

  async function markAllRead() {
    const unread = entries.filter((entry) => !entry.readAt);
    if (unread.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    await kokuDb.transaction("rw", kokuDb.notificationLog, async () => {
      for (const entry of unread) {
        await kokuDb.notificationLog.update(entry.id, { readAt: now });
      }
    });
  }

  async function remove(id: string) {
    await kokuDb.notificationLog.delete(id);
  }

  async function clearAll() {
    await kokuDb.notificationLog.clear();
  }

  return { entries, unreadCount, markAllRead, remove, clearAll };
}
