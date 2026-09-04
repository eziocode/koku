"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ChipGroup, DurationPicker } from "@/components/ui/duration-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { nextEligibleTriggerAt } from "@/lib/reminders/reminders";
import { useReminders } from "@/lib/storage/hooks/use-reminders";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { resolveDurationIso } from "@/lib/time/duration-presets";
import { cn } from "@/lib/utils";
import type { Reminder, ReminderRepeat } from "@/lib/storage/db";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTriggerAt(): string {
  const in15 = new Date(Date.now() + 15 * 60_000);
  return toDatetimeLocalValue(in15);
}

function toTimeValue(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTimeOfDay(): string {
  return toTimeValue(new Date(Date.now() + 15 * 60_000));
}

/** How long from now the "In a while" mode starts on. */
const DEFAULT_IN_MINUTES = 10;

type WhenMode = "in" | "at";

const WHEN_MODES = [
  { value: "in" as const, label: "In a while" },
  { value: "at" as const, label: "At a specific time" },
];

interface ReminderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing reminder instead of creating one. */
  reminder?: Reminder;
}

export function ReminderFormDialog({ open, onOpenChange, reminder }: ReminderFormDialogProps) {
  const { createReminder, updateReminder } = useReminders();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const [message, setMessage] = useState(reminder?.message ?? "");
  const [triggerAt, setTriggerAt] = useState(
    reminder ? toDatetimeLocalValue(new Date(reminder.triggerAt)) : defaultTriggerAt(),
  );
  const [timeOfDay, setTimeOfDay] = useState(
    reminder ? toTimeValue(new Date(reminder.triggerAt)) : defaultTimeOfDay(),
  );
  const [repeat, setRepeat] = useState<ReminderRepeat>(reminder?.repeat ?? "none");
  const [customDays, setCustomDays] = useState<number[]>(reminder?.customDays ?? []);
  const [submitting, setSubmitting] = useState(false);
  // An existing reminder holds an absolute instant, so editing opens on "at";
  // a new one opens on the quicker relative mode.
  const [whenMode, setWhenMode] = useState<WhenMode>(reminder ? "at" : "in");
  const [inMinutes, setInMinutes] = useState<number | null>(DEFAULT_IN_MINUTES);
  const [openedAt, setOpenedAt] = useState(() => new Date());

  // The bell mounts this dialog permanently, so the state initialisers above run
  // once for the lifetime of the page. Without this reset, reopening an hour
  // later still shows the first mount's default time.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setMessage(reminder?.message ?? "");
      setTriggerAt(reminder ? toDatetimeLocalValue(new Date(reminder.triggerAt)) : defaultTriggerAt());
      setTimeOfDay(reminder ? toTimeValue(new Date(reminder.triggerAt)) : defaultTimeOfDay());
      setRepeat(reminder?.repeat ?? "none");
      setCustomDays(reminder?.customDays ?? []);
      setWhenMode(reminder ? "at" : "in");
      setInMinutes(DEFAULT_IN_MINUTES);
      setOpenedAt(new Date());
    }
  }

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Enter a reminder message.");
      return;
    }

    if (repeat === "custom" && customDays.length === 0) {
      toast.error("Pick at least one day to repeat on.");
      return;
    }

    let iso: string;
    if (whenMode === "in") {
      if (inMinutes === null) {
        toast.error("Choose how long from now.");
        return;
      }
      // Resolved against submit time, not the time the dialog opened, so a form
      // left sitting still schedules the duration the user picked.
      iso = resolveDurationIso(inMinutes, new Date());
    } else if (repeat === "none") {
      // A one-off needs a specific date, since there's no recurrence to roll
      // forward to.
      const parsed = new Date(triggerAt);
      if (Number.isNaN(parsed.getTime())) {
        toast.error("Pick a valid date and time.");
        return;
      }
      // A one-off in the past fires on the scheduler's very next tick, which
      // reads as a bug.
      if (parsed.getTime() <= Date.now()) {
        toast.error("Pick a time in the future.");
        return;
      }
      iso = parsed.toISOString();
    } else {
      // Repeating reminders only need a time-of-day — the date is derived:
      // today if that time is still ahead (and, for "custom", today is one
      // of the chosen days), otherwise the next eligible day.
      const [hourStr, minuteStr] = timeOfDay.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        toast.error("Pick a valid time.");
        return;
      }
      iso = nextEligibleTriggerAt(hour, minute, repeat, customDays);
    }

    setSubmitting(true);
    try {
      if (reminder) {
        await updateReminder(reminder.id, {
          message: trimmed,
          triggerAt: iso,
          repeat,
          customDays,
          active: true,
        });
        toast.success("Reminder updated.");
      } else {
        await createReminder({ message: trimmed, triggerAt: iso, repeat, customDays });
        toast.success("Reminder set.");
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "New reminder"}</DialogTitle>
          <DialogDescription>
            koku plays a sound and shows this message when it&apos;s due.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reminder-message">Message</Label>
            <Input
              id="reminder-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Stretch break"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>When</Label>
            <ChipGroup
              value={whenMode}
              onChange={setWhenMode}
              options={WHEN_MODES}
              label="When to remind"
            />
            {whenMode === "in" ? (
              <DurationPicker
                label="Remind me in"
                idPrefix="reminder-in"
                value={inMinutes}
                onChange={setInMinutes}
                labelPrefix="In "
                now={openedAt}
                timeFormat={timeFormat}
                className="pt-1"
              />
            ) : repeat === "none" ? (
              <DateTimePicker
                id="reminder-time"
                value={triggerAt}
                onChange={setTriggerAt}
                timeFormat={timeFormat}
                min={toDatetimeLocalValue(new Date())}
                suggestion={defaultTriggerAt()}
              />
            ) : (
              // Repeating reminders don't need a date — just the time they
              // should fire at each eligible day.
              <Input
                id="reminder-time-only"
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                className="w-32"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-repeat">Repeat</Label>
            <Select value={repeat} onValueChange={(value) => setRepeat(value as ReminderRepeat)}>
              <SelectTrigger id="reminder-repeat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Once</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom days</SelectItem>
              </SelectContent>
            </Select>
            {repeat === "custom" ? (
              <div role="group" aria-label="Repeat on days" className="flex flex-wrap gap-2 pt-1">
                {WEEKDAY_LABELS.map((label, dayIndex) => {
                  const active = customDays.includes(dayIndex);
                  return (
                    <button
                      key={dayIndex}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setCustomDays((prev) =>
                          prev.includes(dayIndex)
                            ? prev.filter((d) => d !== dayIndex)
                            : [...prev, dayIndex].sort((a, b) => a - b),
                        )
                      }
                      className={cn(
                        "h-9 w-11 rounded-lg border text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {reminder ? "Save" : "Set reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
