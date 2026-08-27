"use client";

import { Coffee, Pause, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import {
  formatBreakRemaining,
  getBreakElapsedSec,
  getBreakRemainingSec,
} from "@/lib/breaks/break-math";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { createTimeEntry, ensureBreakAssignments } from "@/lib/time-tracking/time-entries";
import { BREAK_TAG } from "@/lib/notifications/settings";
import { cn, formatDuration } from "@/lib/utils";

const MAX_CUSTOM_MINUTES = 240;
/** Below this, a cancelled break is treated as a mistake and left unlogged. */
const MIN_LOGGABLE_CANCEL_SEC = 60;

/* ─── Start a break ───────────────────────────────────────────────────────── */

export function BreakButton() {
  const { prefs } = useNotificationPreferences();
  const startBreak = useTimerStore((state) => state.startBreak);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");

  if (!prefs.breaks.enabled) {
    return null;
  }

  function begin(plannedDurationSec: number) {
    const started = startBreak({
      label: label.trim() || "Break",
      plannedDurationSec,
    });

    if (!started) {
      toast.error("A break is already running.");
      return;
    }

    setOpen(false);
    setCustom("");
    setLabel("");

    toast.success(
      started.pausedTimerIds.length > 0
        ? `${started.label} started. ${started.pausedTimerIds.length === 1 ? "Your timer is" : "Your timers are"} paused.`
        : `${started.label} started.`,
    );
  }

  const customMinutes = Number(custom);
  const customValid =
    custom.trim() !== "" &&
    Number.isInteger(customMinutes) &&
    customMinutes >= 1 &&
    customMinutes <= MAX_CUSTOM_MINUTES;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Coffee className="h-4 w-4" aria-hidden="true" />
          Break
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Take a break</p>
          <p className="text-xs text-muted-foreground">
            Pauses your timers so break time isn’t logged as work.
          </p>
        </div>

        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Break length"
        >
          {prefs.breaks.presetMinutes.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => begin(minutes * 60)}
              className={cn(
                "min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {minutes} min
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="break-label">Label</Label>
          <Input
            id="break-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Break"
            className="min-h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="break-custom">Custom length (minutes)</Label>
          <div className="flex gap-2">
            <Input
              id="break-custom"
              type="number"
              min={1}
              max={MAX_CUSTOM_MINUTES}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="20"
              className="min-h-11"
              aria-describedby="break-custom-hint"
            />
            <Button disabled={!customValid} onClick={() => begin(customMinutes * 60)}>
              Start
            </Button>
          </div>
          <p id="break-custom-hint" className="text-xs text-muted-foreground">
            1–{MAX_CUSTOM_MINUTES} minutes, or start an open-ended break below.
          </p>
        </div>

        <Button variant="ghost" className="w-full gap-2" onClick={() => begin(0)}>
          <Pause className="h-4 w-4" aria-hidden="true" />
          Open-ended break
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* ─── An in-progress break ────────────────────────────────────────────────── */

/**
 * Replaces the timer form while a break is running.
 *
 * The countdown is recomputed from `startedAt` on every tick rather than
 * decremented, so it stays truthful across a reload, a throttled background tab,
 * or a closed laptop lid.
 */
export function BreakCard() {
  const { prefs } = useNotificationPreferences();
  const activeBreak = useTimerStore((state) => state.activeBreak);
  const extendBreak = useTimerStore((state) => state.extendBreak);
  const finishBreak = useTimerStore((state) => state.finishBreak);
  const tickNow = useSecondTick();
  const [submitting, setSubmitting] = useState(false);

  if (!activeBreak) {
    return null;
  }

  // Bound to a local so the async handler below keeps the narrowed type and
  // operates on the break as it was when the user clicked.
  const current = activeBreak;
  const elapsedSec = getBreakElapsedSec(current, tickNow);
  const remainingSec = getBreakRemainingSec(current, tickNow);
  const openEnded = current.plannedDurationSec <= 0;
  const progress = openEnded
    ? 0
    : Math.min(100, Math.round((elapsedSec / current.plannedDurationSec) * 100));

  async function end(outcome: "completed" | "cancelled") {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      const shouldLog = outcome === "completed" || elapsedSec >= MIN_LOGGABLE_CANCEL_SEC;

      // Written before finishing, so a failed write leaves the break intact and
      // retryable rather than losing the record.
      if (shouldLog) {
        // A quick action (e.g. "Call") carries its own project/category and
        // tag; a plain break falls back to the shared "Break" assignments.
        const isQuickAction = Boolean(current.tag);
        const assignments = isQuickAction
          ? { projectId: current.projectId ?? null, categoryId: current.categoryId ?? null }
          : await ensureBreakAssignments();
        const baseTag = isQuickAction ? current.tag! : BREAK_TAG;
        await createTimeEntry({
          title: current.label,
          ...assignments,
          startAt: current.startedAt,
          endAt: new Date(tickNow).toISOString(),
          durationSec: elapsedSec,
          tags: outcome === "cancelled" ? [baseTag, "cancelled"] : [baseTag],
          notes: current.notes ?? null,
        });
      }

      const completion = finishBreak(outcome, { autoResume: prefs.breaks.autoResume });
      if (!completion) {
        return;
      }

      toast.success(
        completion.resumedTimerIds.length > 0
          ? `${current.label} ended. Your timer is running again.`
          : `${current.label} ended.`,
      );
    } catch {
      toast.error("Couldn’t log your break. It’s still running so you can retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{current.label}</p>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              <span className="koku-live-dot" aria-hidden="true" />
              {current.tag ? "Running" : "On a break"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {current.tag
              ? `Timers are paused until ${current.label} ends.`
              : "Timers are paused until the break ends."}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-foreground">
          {openEnded ? formatDuration(elapsedSec) : formatBreakRemaining(remainingSec ?? 0)}
        </p>
      </div>

      {openEnded ? null : (
        <Progress value={progress} className="mt-4" aria-label="Break progress" />
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {openEnded ? null : (
          <Button variant="secondary" onClick={() => extendBreak(5 * 60)} disabled={submitting}>
            Extend +5m
          </Button>
        )}
        <Button onClick={() => void end("completed")} disabled={submitting}>
          End break now
        </Button>
        <Button variant="ghost" className="gap-2" onClick={() => void end("cancelled")} disabled={submitting}>
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
