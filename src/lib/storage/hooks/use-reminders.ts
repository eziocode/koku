"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb, type Reminder } from "@/lib/storage/db";
import {
  createReminder,
  deleteReminder,
  updateReminder,
  type CreateReminderInput,
  type UpdateReminderInput,
} from "@/lib/reminders/reminders";

const EMPTY_REMINDERS: Reminder[] = [];

export function useReminders() {
  const reminders = useLiveQuery(
    () => kokuDb.reminders.orderBy("triggerAt").toArray(),
    [],
    EMPTY_REMINDERS,
  );

  const activeReminders = reminders.filter((reminder) => reminder.active);

  return {
    reminders,
    activeReminders,
    createReminder: (data: CreateReminderInput) => createReminder(data),
    updateReminder: (id: string, data: UpdateReminderInput) => updateReminder(id, data),
    deleteReminder: (id: string) => deleteReminder(id),
  };
}
