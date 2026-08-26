"use client";

import { Coffee, Pause, Play, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  formatBreakRemaining,
  getBreakElapsedSec,
  getBreakRemainingSec,
} from "@/lib/breaks/break-math";
import { closeMiniPlayerWindow } from "@/lib/mini-player/window-controller";
import { BREAK_TAG } from "@/lib/notifications/settings";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { getActiveTimerElapsedSec, useTimerStore } from "@/lib/stores/timer-store";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { createTimeEntry, ensureBreakAssignments } from "@/lib/time-tracking/time-entries";
import { stopTimerAndPersist } from "@/lib/time-tracking/stop-timer";
import { cn, formatDuration } from "@/lib/utils";

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Two rules for everything rendered in here. Please don't "improve" them.   │
 * │                                                                          │
 * │ 1. NO Radix components. Every wrapper in `src/components/ui/` hardcodes   │
 * │    `Portal` with no `container` prop, so a Select/Tooltip/Dialog opened   │
 * │    from this window renders invisibly in the MAIN document instead.       │
 * │    Plain <button>/<input>/<div> with the same Tailwind classes only.      │
 * │                                                                          │
 * │ 2. NO `toast()`. The sonner <Toaster> lives in the main document, so a    │
 * │    toast fired from here is shown somewhere the user isn't looking.       │
 * │    Feedback goes in the inline status row.                                │
 * │                                                                          │
 * │ Also: no JS animation and no transition on the clock. The cloned          │
 * │ stylesheet carries koku's `prefers-reduced-motion` guards, and JS-driven  │
 * │ motion would escape them.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const BUTTON_BASE =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_QUIET = "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground";
const BUTTON_PRIMARY = "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15";

interface MiniPlayerSurfaceProps {
  pipWindow: Window;
}

export function MiniPlayerSurface({ pipWindow }: MiniPlayerSurfaceProps) {
  const { prefs } = useNotificationPreferences();
  const timers = useTimerStore((state) => state.timers);
  const activeBreak = useTimerStore((state) => state.activeBreak);
  const pauseTimer = useTimerStore((state) => state.pauseTimer);
  const resumeTimer = useTimerStore((state) => state.resumeTimer);
  const startBreak = useTimerStore((state) => state.startBreak);
  const finishBreak = useTimerStore((state) => state.finishBreak);
  const appendNote = useTimerStore((state) => state.appendNote);
  const appendBreakNote = useTimerStore((state) => state.appendBreakNote);

  const tickNow = useSecondTick();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Listeners must be bound to the PiP window's own globals, not the opener's —
  // key events in this document never reach the main window.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMiniPlayerWindow();
      }
    };

    pipWindow.addEventListener("keydown", onKeyDown);
    return () => pipWindow.removeEventListener("keydown", onKeyDown);
  }, [pipWindow]);

  const primary = timers.find((timer) => !timer.parentTimerId) ?? timers[0] ?? null;
  const secondaries = primary ? timers.filter((timer) => timer.parentTimerId === primary.id) : [];
  const onBreak = Boolean(activeBreak && !activeBreak.completedAt);

  /** Announced once via a live region; the ticking clock deliberately is not. */
  function announce(message: string) {
    setStatus(message);
  }

  async function saveNote() {
    const trimmed = note.trim();
    if (!trimmed) {
      return;
    }

    if (onBreak) {
      appendBreakNote(trimmed);
      setNote("");
      announce("Note added to your break.");
      return;
    }

    if (!primary) {
      const now = new Date().toISOString();
      await createTimeEntry({
        title: trimmed.length > 60 ? `${trimmed.slice(0, 59)}…` : trimmed,
        startAt: now,
        endAt: now,
        durationSec: 0,
        tags: ["quick-note"],
        notes: trimmed,
      });
      setNote("");
      announce("Note saved to your log.");
      return;
    }

    appendNote(primary.id, trimmed);
    setNote("");
    announce("Note added.");
  }

  async function stop(timerId: string) {
    setBusy(true);
    try {
      const result = await stopTimerAndPersist(timerId);
      announce(result.stopped ? "Entry saved." : "Nothing to save.");
    } catch {
      announce("Couldn’t save — the timer is still running.");
    } finally {
      setBusy(false);
    }
  }

  async function endBreak() {
    if (!activeBreak) {
      return;
    }

    setBusy(true);
    const elapsedSec = getBreakElapsedSec(activeBreak, tickNow);

    try {
      const breakAssignments = await ensureBreakAssignments();
      await createTimeEntry({
        title: activeBreak.label,
        ...breakAssignments,
        startAt: activeBreak.startedAt,
        endAt: new Date(tickNow).toISOString(),
        durationSec: elapsedSec,
        tags: [BREAK_TAG],
        notes: activeBreak.notes ?? null,
      });

      finishBreak("completed", { autoResume: prefs.breaks.autoResume });
      announce("Break ended.");
    } catch {
      announce("Couldn’t log the break — it’s still running.");
    } finally {
      setBusy(false);
    }
  }

  const heroSeconds = onBreak && activeBreak
    ? (getBreakRemainingSec(activeBreak, tickNow) ?? getBreakElapsedSec(activeBreak, tickNow))
    : primary
      ? getActiveTimerElapsedSec(primary, tickNow)
      : 0;

  return (
    <div className="flex h-full flex-col gap-3 bg-background p-3 text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {onBreak && activeBreak ? activeBreak.label : primary?.title ?? "No timer running"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {/* A paused primary with a parallel task still running is not
                "Paused" — the app is tracking, just not this row. */}
            {onBreak
              ? "Timers paused until the break ends"
              : primary
                ? primary.pausedAt
                  ? secondaries.some((timer) => !timer.pausedAt)
                    ? `Paused · ${secondaries.filter((timer) => !timer.pausedAt).length} parallel running`
                    : "Paused"
                  : "Tracking"
                : "Start one in koku"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close mini player"
          onClick={() => closeMiniPlayerWindow()}
          className={cn(BUTTON_BASE, BUTTON_QUIET, "min-h-9 px-2")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* ── Clock ──────────────────────────────────────────────────────────── */}
      {/* role="timer" with an explicit aria-live="off": a polite live region
          updating every second would queue one announcement per second and make
          the app unusable with a screen reader. Discrete changes are announced
          through the status region at the bottom instead. */}
      <p
        role="timer"
        aria-live="off"
        className="font-mono text-4xl font-semibold tabular-nums leading-none"
      >
        {onBreak && activeBreak && activeBreak.plannedDurationSec > 0
          ? formatBreakRemaining(heroSeconds)
          : formatDuration(heroSeconds)}
      </p>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {onBreak ? (
          <button
            type="button"
            onClick={() => void endBreak()}
            disabled={busy}
            className={cn(BUTTON_BASE, BUTTON_PRIMARY)}
          >
            <Coffee className="h-4 w-4" aria-hidden="true" />
            End break
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label={primary?.pausedAt ? "Resume timer" : "Pause timer"}
              disabled={!primary || busy}
              onClick={() => {
                if (!primary) return;
                if (primary.pausedAt) {
                  if (!resumeTimer(primary.id)) {
                    announce("Finish your break to resume.");
                    return;
                  }
                  announce("Timer resumed.");
                } else {
                  pauseTimer(primary.id);
                  announce("Timer paused.");
                }
              }}
              className={cn(BUTTON_BASE, BUTTON_QUIET)}
            >
              {primary?.pausedAt ? (
                <Play className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Pause className="h-4 w-4" aria-hidden="true" />
              )}
              {primary?.pausedAt ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              aria-label="Stop and save timer"
              disabled={!primary || busy}
              onClick={() => primary && void stop(primary.id)}
              className={cn(BUTTON_BASE, BUTTON_QUIET)}
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              Stop
            </button>
            {prefs.breaks.enabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const started = startBreak({
                    label: "Break",
                    plannedDurationSec: prefs.breaks.defaultMinutes * 60,
                  });
                  announce(started ? "Break started." : "A break is already running.");
                }}
                className={cn(BUTTON_BASE, BUTTON_QUIET)}
              >
                <Coffee className="h-4 w-4" aria-hidden="true" />
                Break
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* ── Secondary timers ───────────────────────────────────────────────── */}
      {secondaries.length > 0 ? (
        <div className="space-y-1">
          {secondaries.map((timer) => (
            <div key={timer.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{timer.title}</span>
              <span className="font-mono tabular-nums">
                {formatDuration(getActiveTimerElapsedSec(timer, tickNow))}
              </span>
              <button
                type="button"
                aria-label={`Stop ${timer.title}`}
                disabled={busy}
                onClick={() => void stop(timer.id)}
                className={cn(BUTTON_BASE, BUTTON_QUIET, "min-h-8 px-2")}
              >
                <Square className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Quick note ─────────────────────────────────────────────────────── */}
      <div className="mt-auto space-y-1.5">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void saveNote();
            }

            if (event.key === "Escape") {
              // Escape in the field clears it; Escape elsewhere closes the window.
              event.stopPropagation();
              setNote("");
            }
          }}
          placeholder="Add a note…"
          aria-label="Quick note"
          className="min-h-11 w-full rounded-xl border border-border/70 bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40"
        />
        {/* The one live region in here: discrete, infrequent announcements. */}
        <p aria-live="polite" className="min-h-4 truncate text-xs text-muted-foreground">
          {status ?? <span className="opacity-70">Enter to save · Esc closes</span>}
        </p>
      </div>
    </div>
  );
}
