import { kokuDb, type Reminder, type ReminderRepeat } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

/** Framework-free reminder writes, mirroring `tasks/tasks.ts`. */

export interface CreateReminderInput {
  message: string;
  triggerAt: string;
  repeat?: ReminderRepeat;
}

export interface UpdateReminderInput {
  message?: string;
  triggerAt?: string;
  repeat?: ReminderRepeat;
  active?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** The next occurrence after `firedAt`, advancing by whole days/weeks so time-of-day never drifts. */
export function nextTriggerAt(firedAt: string, repeat: ReminderRepeat): string {
  const base = Date.parse(firedAt);
  if (repeat === "daily") return new Date(base + DAY_MS).toISOString();
  if (repeat === "weekly") return new Date(base + WEEK_MS).toISOString();
  return firedAt;
}

export async function createReminder(data: CreateReminderInput): Promise<Reminder> {
  const now = new Date().toISOString();
  const reminder: Reminder = {
    id: crypto.randomUUID(),
    message: data.message,
    triggerAt: data.triggerAt,
    repeat: data.repeat ?? "none",
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await kokuDb.reminders.add(reminder);
  void syncRow("reminders", reminder);
  return reminder;
}

export async function updateReminder(id: string, data: UpdateReminderInput): Promise<Reminder | null> {
  const existing = await kokuDb.reminders.get(id);
  if (!existing) return null;

  const updated: Reminder = { ...existing, ...data, updatedAt: new Date().toISOString() };
  await kokuDb.reminders.put(updated);
  void syncRow("reminders", updated);
  return updated;
}

export async function deleteReminder(id: string): Promise<void> {
  await kokuDb.reminders.delete(id);
  void deleteRow("reminders", id);
}

/**
 * Applies one firing: `"none"` deactivates, `"daily"`/`"weekly"` advance
 * `triggerAt` to the next occurrence and stay active.
 */
export async function markReminderFired(reminder: Reminder, firedAt: string): Promise<void> {
  if (reminder.repeat === "none") {
    await updateReminder(reminder.id, { active: false });
    return;
  }

  await updateReminder(reminder.id, { triggerAt: nextTriggerAt(firedAt, reminder.repeat) });
}
