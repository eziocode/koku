"use client";

import { kokuDb } from "@/lib/storage/db";
import { getAuthUser } from "@/lib/sync/sync-engine";
import { buildAdminAlertNotification } from "@/lib/notifications/payload";
import { showKokuNotification } from "@/lib/notifications/client";
import { playReminderChime } from "@/lib/notifications/sound";
import { notificationPreferencesSchema } from "@/lib/notifications/settings";

export const ADMIN_ALERT_POLL_MS = 5_000;

const LAST_PULL_KEY = "lastAdminAlertSyncAt";

type AdminAlertRow = {
  id: string;
  message: string;
  senderName: string;
  scope: "global" | "direct";
  createdAt: string;
};

async function getWatermark(userId: string): Promise<string | null> {
  const row = await kokuDb.settings.get(`${LAST_PULL_KEY}:${userId}`);
  return typeof row?.value === "string" ? row.value : null;
}

async function setWatermark(userId: string, iso: string) {
  await kokuDb.settings.put({ key: `${LAST_PULL_KEY}:${userId}`, value: iso });
}

/** Pulls, shows, and chimes for any admin alerts sent to this user since the last poll. */
export async function pullAdminAlerts(): Promise<void> {
  try {
    if (!navigator.onLine) return;
    const user = await getAuthUser();
    if (!user) return;

    const since = await getWatermark(user.id);
    const url = since ? `/api/sync/notifications?since=${encodeURIComponent(since)}` : "/api/sync/notifications";
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return;

    const { rows } = (await response.json()) as { rows?: AdminAlertRow[] };
    if (!rows?.length) return;

    const settingsRow = await kokuDb.settings.get("notifications");
    const prefs = notificationPreferencesSchema.parse(settingsRow?.value);

    for (const row of rows) {
      const built = buildAdminAlertNotification(row.id, row.message, row.senderName, row.scope, Date.parse(row.createdAt) || Date.now());
      const shown = await showKokuNotification(built);
      if (shown && prefs.sound.enabled) playReminderChime(prefs.sound.volume);
    }

    const latest = rows.reduce((max, row) => (row.createdAt > max ? row.createdAt : max), since ?? rows[0].createdAt);
    await setWatermark(user.id, latest);
  } catch {
    // Poll failure is normal offline behavior; next tick retries.
  }
}

/** Start once in root client provider. Mirrors `startLiveStateSync`'s visible-tab poll. */
export function startAdminAlertSync(): () => void {
  const poll = () => { if (document.visibilityState === "visible") void pullAdminAlerts(); };
  poll();
  const interval = window.setInterval(poll, ADMIN_ALERT_POLL_MS);
  window.addEventListener("online", poll);
  document.addEventListener("visibilitychange", poll);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("online", poll);
    document.removeEventListener("visibilitychange", poll);
  };
}
