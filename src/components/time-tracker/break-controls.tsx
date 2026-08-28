"use client";

import { Coffee, Pause, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  formatBreakRemaining,
  getBreakElapsedSec,
  getBreakRemainingSec,
} from "@/lib/breaks/break-math";
import { resolvePeriodCopy } from "@/lib/breaks/break-copy";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { useTimerStore } from "@/lib/stores/timer-store";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { writeBreakEntry } from "@/lib/breaks/finalize-break";
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

    toast.success(resolvePeriodCopy(started).startedToast(started.pausedTimerIds.length));
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
  const appendBreakNote = useTimerStore((state) => state.appendBreakNote);
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const tickNow = useSecondTick();
  const [submitting, setSubmitting] = useState(false);
  const [noteText, setNoteText] = useState("");

  if (!activeBreak) {
    return null;
  }

  // Bound to a local so the async handler below keeps the narrowed type and
  // operates on the break as it was when the user clicked.
  const current = activeBreak;
  const copy = resolvePeriodCopy(current);
  const elapsedSec = getBreakElapsedSec(current, tickNow);
  const remainingSec = getBreakRemainingSec(current, tickNow);
  const openEnded = current.plannedDurationSec <= 0;
  const progress = openEnded
    ? 0
    : Math.min(100, Math.round((elapsedSec / current.plannedDurationSec) * 100));
  const capturedNotes = current.notes?.split("\n").filter(Boolean) ?? [];

  function submitNote() {
    const trimmed = noteText.trim();
    if (!trimmed) {
      return;
    }
    appendBreakNote(trimmed, new Date(), timeFormat);
    setNoteText("");
  }

  async function end(outcome: "completed" | "cancelled") {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      // Flush whatever is still sitting in the textarea, then re-read fresh
      // state — appendBreakNote above may have just written it, and another
      // tab (or the mini player) may have added its own note since this
      // component last rendered. Reading `current.notes` here would drop both.
      const trimmed = noteText.trim();
      if (trimmed) {
        appendBreakNote(trimmed, new Date(), timeFormat);
        setNoteText("");
      }
      const latest = useTimerStore.getState().activeBreak ?? current;

      const shouldLog = outcome === "completed" || elapsedSec >= MIN_LOGGABLE_CANCEL_SEC;

      // Written before finishing, so a failed write leaves the break intact and
      // retryable rather than losing the record.
      if (shouldLog) {
        await writeBreakEntry(latest, {
          endAtIso: new Date(tickNow).toISOString(),
          elapsedSec,
          outcome,
        });
      }

      const completion = finishBreak(outcome, { autoResume: prefs.breaks.autoResume });
      if (!completion) {
        return;
      }

      toast.success(copy.endedToast(completion.resumedTimerIds.length));
    } catch {
      toast.error(copy.logFailedMessage);
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
              {copy.statusBadge}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{copy.statusLine}</p>
          {current.description && (
            <p className="text-sm text-muted-foreground/80">{current.description}</p>
          )}
        </div>
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-foreground">
          {openEnded ? formatDuration(elapsedSec) : formatBreakRemaining(remainingSec ?? 0)}
        </p>
      </div>

      {openEnded ? null : (
        <Progress value={progress} className="mt-4" aria-label={copy.progressLabel} />
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {openEnded ? null : (
          <Button variant="secondary" onClick={() => extendBreak(5 * 60)} disabled={submitting}>
            Extend +5m
          </Button>
        )}
        <Button onClick={() => void end("completed")} disabled={submitting}>
          {copy.endLabel}
        </Button>
        <Button variant="ghost" className="gap-2" onClick={() => void end("cancelled")} disabled={submitting}>
          <X className="h-4 w-4" aria-hidden="true" />
          {copy.cancelLabel}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="break-note" className="text-xs text-muted-foreground">
          {copy.notePrompt}
        </Label>
        <div className="flex gap-2">
          <Textarea
            id="break-note"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitNote();
              }
            }}
            placeholder={copy.notePrompt}
            rows={2}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={submitNote} disabled={!noteText.trim()}>
            Add note
          </Button>
        </div>
        {capturedNotes.length > 0 && (
          <ScrollArea className="max-h-24 rounded-lg border border-border bg-background/50 p-2">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {capturedNotes.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
