"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DurationPicker } from "@/components/ui/duration-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { useTimerStore } from "@/lib/stores/timer-store";
import { startQuickTimer } from "@/lib/time-tracking/quick-timer";

const DEFAULT_MINUTES = 10;

interface QuickTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Starts a quick timer with a planned length.
 *
 * Lives beside the palette rather than inside it: a `Command.Item` cannot host
 * a stepper, because cmdk owns the arrow keys and Enter within its list and
 * would fight the picker's own chip traversal. The guard handling is
 * `startQuickTimer`'s, so this surface cannot drift from the palette's plain
 * "Start timer" or the `t` shortcut.
 */
export function QuickTimerDialog({ open, onOpenChange }: QuickTimerDialogProps) {
  const router = useRouter();
  const { timers, activeBreak, startTimer } = useTimerStore();
  const { prefs } = useNotificationPreferences();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState<number | null>(DEFAULT_MINUTES);
  const [openedAt, setOpenedAt] = useState(() => new Date());

  // Reset on open so a page left sitting never offers a stale end time.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTitle("");
      setMinutes(DEFAULT_MINUTES);
      setOpenedAt(new Date());
    }
  }

  function handleStart() {
    const result = startQuickTimer(
      {
        timers,
        activeBreak,
        blockNewTimers: prefs.breaks.blockNewTimers,
        startTimer,
      },
      { plannedMinutes: minutes ?? undefined, title },
    );

    onOpenChange(false);
    router.push("/log");

    if (result.status !== "started") {
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a timer</DialogTitle>
          <DialogDescription>
            Sets a target length. The timer counts down but keeps running past it, so nothing is
            cut short.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-timer-title">What are you working on?</Label>
            <Input
              id="quick-timer-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Quick focus"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Focus for</Label>
            <DurationPicker
              label="Focus length"
              idPrefix="quick-timer-length"
              value={minutes}
              onChange={setMinutes}
              now={openedAt}
              timeFormat={timeFormat}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={minutes === null}>
            Start timer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
