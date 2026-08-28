"use client";

import { CalendarOff, NotebookPen, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { QuickNoteComposer, type QuickNoteTarget } from "@/components/notifications/quick-note-composer";
import { EntryForm } from "@/components/time-tracker/entry-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { toHolidayDateKey, toggleHolidayDate } from "@/lib/notifications/settings";
import { getActiveTimerElapsedSec, useTimerStore } from "@/lib/stores/timer-store";
import { useSecondTick } from "@/lib/stores/use-ticker";

/** Start and end defaults for a manual entry: the hour that just passed. */
function getManualEntryDefaults() {
  const end = new Date();
  end.setSeconds(0, 0);
  const start = new Date(end.getTime() - 60 * 60_000);

  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

/**
 * Capture actions that do not need the live timer.
 *
 * Sits beneath the week chart, which is shorter than the timer column beside it:
 * at mid widths that left a visible hole in the grid. Filling it with the two
 * things people reach for when the timer is *not* the answer — a manual entry
 * for work already done, and a note — makes the column earn its height instead
 * of padding it.
 */
export function QuickCaptureCard() {
  const [manualOpen, setManualOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // Stamped when the dialog opens, not on every render: a value derived from the
  // clock during render would drift while the form is being filled in.
  const [manualEntryDefaults, setManualEntryDefaults] = useState(getManualEntryDefaults);
  const [noteOpen, setNoteOpen] = useState(false);
  const { prefs, patch } = useNotificationPreferences();
  const { timers, activeBreak } = useTimerStore();
  const tickNow = useSecondTick();

  const todayKey = toHolidayDateKey(new Date(tickNow));
  const isTodayHoliday = prefs.holidayDates.includes(todayKey);

  // A quick note attaches to whatever is actually in flight, so the composer
  // says truthfully where it will land rather than always claiming standalone.
  const noteTarget = useMemo<QuickNoteTarget>(() => {
    if (activeBreak && !activeBreak.completedAt) {
      return { kind: "break", label: activeBreak.label, tag: activeBreak.tag };
    }

    const running = timers.find((timer) => !timer.pausedAt) ?? timers[0];
    if (running) {
      return {
        kind: "timer",
        timerId: running.id,
        title: running.title,
        elapsedSec: getActiveTimerElapsedSec(running, tickNow),
      };
    }

    return { kind: "standalone" };
  }, [activeBreak, tickNow, timers]);

  async function toggleTodayHoliday() {
    await patch({ holidayDates: toggleHolidayDate(prefs.holidayDates, todayKey) });
    toast.success(
      isTodayHoliday
        ? "Today is a working day again. Notifications resume."
        : "Today is a holiday. Notifications are silenced for the rest of it.",
    );
  }

  return (
    <>
      <Card className="minimal-panel">
        <CardHeader>
          <CardTitle>Quick capture</CardTitle>
          <CardDescription>
            For work the timer missed, and thoughts that need somewhere to land.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => {
              setManualEntryDefaults(getManualEntryDefaults());
              setFormKey((key) => key + 1);
              setManualOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Manual entry
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setNoteOpen(true)}>
            <NotebookPen className="h-4 w-4" />
            Quick note
          </Button>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => void toggleTodayHoliday()}
            aria-pressed={isTodayHoliday}
          >
            <CalendarOff className="h-4 w-4" />
            {isTodayHoliday ? "Unmark holiday" : "Mark today a holiday"}
          </Button>
          {isTodayHoliday ? (
            <p className="w-full text-xs text-muted-foreground">
              Today is marked as a holiday. Check-ins and the end-of-day wrap-up stay quiet. Manage
              the full list in notification settings.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a manual entry</DialogTitle>
            <DialogDescription>
              Log work you did without a timer running. Defaults to the hour just gone.
            </DialogDescription>
          </DialogHeader>
          <EntryForm
            key={formKey}
            showSaveAndNew
            defaultValues={manualEntryDefaults}
            onSuccess={() => setManualOpen(false)}
            onSuccessNew={() => {
              setManualEntryDefaults(getManualEntryDefaults());
              setFormKey((key) => key + 1);
            }}
          />
        </DialogContent>
      </Dialog>

      <QuickNoteComposer open={noteOpen} onOpenChange={setNoteOpen} target={noteTarget} />
    </>
  );
}
