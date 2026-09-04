"use client";

import { format } from "date-fns";
import { AlarmClock, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReminderFormDialog } from "@/components/reminders/reminder-form-dialog";
import { useReminders } from "@/lib/storage/hooks/use-reminders";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatTime } from "@/lib/time-format";
import type { ReminderRepeat } from "@/lib/storage/db";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatRepeatSuffix(repeat: ReminderRepeat, customDays: number[]): string {
  if (repeat === "none") return "";
  if (repeat === "custom") {
    return customDays.length > 0 ? ` · ${customDays.map((d) => WEEKDAY_LABELS[d]).join(", ")}` : "";
  }
  return ` · ${repeat}`;
}

/**
 * Global "set a reminder" entry point, mounted in the topbar so it's reachable
 * from every page — mirrors `NotificationBell`'s popover-plus-list shape.
 */
export function ReminderBell() {
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const { activeReminders, deleteReminder } = useReminders();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={activeReminders.length > 0 ? `Reminders, ${activeReminders.length} set` : "Set a reminder"}
          >
            <AlarmClock />
            {activeReminders.length > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
              >
                {activeReminders.length > 9 ? "9+" : activeReminders.length}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Reminders</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-2 py-1 text-xs"
              onClick={() => setFormOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>

          {activeReminders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No reminders set. Create one for a custom message and sound at any time.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {activeReminders.map((reminder) => (
                <li key={reminder.id} className="flex items-start gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{reminder.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {`${format(new Date(reminder.triggerAt), "MMM d")}, ${formatTime(reminder.triggerAt, timeFormat)}`}
                      {formatRepeatSuffix(reminder.repeat, reminder.customDays)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete reminder: ${reminder.message}`}
                    onClick={() => void deleteReminder(reminder.id)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <ReminderFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
