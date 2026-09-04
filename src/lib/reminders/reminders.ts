import { kokuDb, type Reminder, type ReminderRepeat } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

/** Framework-free reminder writes, mirroring `tasks/tasks.ts`. */

export interface CreateReminderInput {
  message: string;
  triggerAt: string;
  repeat?: ReminderRepeat;
  /** Required (non-empty) when `repeat === "custom"`. */
  customDays?: number[];
}

export interface UpdateReminderInput {
  message?: string;
  triggerAt?: string;
  repeat?: ReminderRepeat;
  customDays?: number[];
  active?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * The next occurrence after `firedAt`, advancing by whole days/weeks so
 * time-of-day never drifts. `"custom"` walks forward to the nearest upcoming
 * day (1-7 days out) in `customDays` — weekends included, since nothing here
 * treats Saturday/Sunday specially.
 */
export function nextTriggerAt(firedAt: string, repeat: ReminderRepeat, customDays: number[] = []): string {
  const base = Date.parse(firedAt);
  if (repeat === "daily") return new Date(base + DAY_MS).toISOString();
  if (repeat === "weekly") return new Date(base + WEEK_MS).toISOString();
  if (repeat === "custom" && customDays.length > 0) {
    for (let offset = 1; offset <= 7; offset++) {
      const candidate = new Date(base + offset * DAY_MS);
      if (customDays.includes(candidate.getDay())) {
        return candidate.toISOString();
      }
    }
  }
  return firedAt;
}

/**
 * First trigger for a repeating reminder created from a time-of-day only
 * (no date picked). Uses today at `hour:minute` if that instant is still
 * ahead, otherwise walks forward the same way `nextTriggerAt` does so a
 * daily reminder set for a time that already passed today fires tomorrow
 * instead of immediately.
 */
export function nextEligibleTriggerAt(
  hour: number,
  minute: number,
  repeat: Exclude<ReminderRepeat, "none">,
  customDays: number[] = [],
  now: Date = new Date(),
): string {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  const isFuture = candidate.getTime() > now.getTime();

  if (repeat === "custom") {
    if (isFuture && customDays.includes(candidate.getDay())) return candidate.toISOString();
    return nextTriggerAt(candidate.toISOString(), "custom", customDays);
  }

  if (isFuture) return candidate.toISOString();
  return nextTriggerAt(candidate.toISOString(), repeat, customDays);
}

export async function createReminder(data: CreateReminderInput): Promise<Reminder> {
  const now = new Date().toISOString();
  const reminder: Reminder = {
    id: crypto.randomUUID(),
    message: data.message,
    triggerAt: data.triggerAt,
    repeat: data.repeat ?? "none",
    customDays: data.customDays ?? [],
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
 * `triggerAt` to the next occurrence and stay active. The next occurrence is
 * computed from the reminder's own scheduled `triggerAt`, not from the actual
 * (possibly-late) moment the scheduler noticed it — otherwise a reminder
 * checked minutes or hours late would drift to that check time instead of
 * repeating at its original time-of-day.
 */
export async function markReminderFired(reminder: Reminder): Promise<void> {
  if (reminder.repeat === "none") {
    await updateReminder(reminder.id, { active: false });
    return;
  }

  await updateReminder(reminder.id, {
    triggerAt: nextTriggerAt(reminder.triggerAt, reminder.repeat, reminder.customDays),
  });
}
