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
import { useReminders } from "@/lib/storage/hooks/use-reminders";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { resolveDurationIso } from "@/lib/time/duration-presets";
import type { Reminder, ReminderRepeat } from "@/lib/storage/db";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTriggerAt(): string {
  const in15 = new Date(Date.now() + 15 * 60_000);
  return toDatetimeLocalValue(in15);
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
  const [repeat, setRepeat] = useState<ReminderRepeat>(reminder?.repeat ?? "none");
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
      setRepeat(reminder?.repeat ?? "none");
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

    let iso: string;
    if (whenMode === "in") {
      if (inMinutes === null) {
        toast.error("Choose how long from now.");
        return;
      }
      // Resolved against submit time, not the time the dialog opened, so a form
      // left sitting still schedules the duration the user picked.
      iso = resolveDurationIso(inMinutes, new Date());
    } else {
      const parsed = new Date(triggerAt);
      if (Number.isNaN(parsed.getTime())) {
        toast.error("Pick a valid date and time.");
        return;
      }
      // A one-off in the past fires on the scheduler's very next tick, which
      // reads as a bug. A repeating one is fine: it rolls forward on its own.
      if (repeat === "none" && parsed.getTime() <= Date.now()) {
        toast.error("Pick a time in the future.");
        return;
      }
      iso = parsed.toISOString();
    }

    setSubmitting(true);
    try {
      if (reminder) {
        await updateReminder(reminder.id, {
          message: trimmed,
          triggerAt: iso,
          repeat,
          active: true,
        });
        toast.success("Reminder updated.");
      } else {
        await createReminder({ message: trimmed, triggerAt: iso, repeat });
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
            ) : (
              <DateTimePicker
                id="reminder-time"
                value={triggerAt}
                onChange={setTriggerAt}
                timeFormat={timeFormat}
                min={toDatetimeLocalValue(new Date())}
                suggestion={defaultTriggerAt()}
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
              </SelectContent>
            </Select>
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
