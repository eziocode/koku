"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useReminders } from "@/lib/storage/hooks/use-reminders";
import type { Reminder, ReminderRepeat } from "@/lib/storage/db";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTriggerAt(): string {
  const in15 = new Date(Date.now() + 15 * 60_000);
  return toDatetimeLocalValue(in15);
}

interface ReminderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing reminder instead of creating one. */
  reminder?: Reminder;
}

export function ReminderFormDialog({ open, onOpenChange, reminder }: ReminderFormDialogProps) {
  const { createReminder, updateReminder } = useReminders();
  const [message, setMessage] = useState(reminder?.message ?? "");
  const [triggerAt, setTriggerAt] = useState(
    reminder ? toDatetimeLocalValue(new Date(reminder.triggerAt)) : defaultTriggerAt(),
  );
  const [repeat, setRepeat] = useState<ReminderRepeat>(reminder?.repeat ?? "none");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Enter a reminder message.");
      return;
    }

    const parsed = new Date(triggerAt);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Pick a valid date and time.");
      return;
    }

    setSubmitting(true);
    try {
      if (reminder) {
        await updateReminder(reminder.id, {
          message: trimmed,
          triggerAt: parsed.toISOString(),
          repeat,
          active: true,
        });
        toast.success("Reminder updated.");
      } else {
        await createReminder({ message: trimmed, triggerAt: parsed.toISOString(), repeat });
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
            <Label htmlFor="reminder-time">When</Label>
            <Input
              id="reminder-time"
              type="datetime-local"
              value={triggerAt}
              onChange={(event) => setTriggerAt(event.target.value)}
            />
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
