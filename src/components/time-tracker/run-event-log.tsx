"use client";

import { Pause, Play, RotateCcw, Square } from "lucide-react";

import {
  formatRunLog,
  type FormattableRun,
  type RunLogEvent,
  type RunLogEventKind,
} from "@/lib/charts/run-format";
import type { TimeFormat } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

/**
 * An entry's Started/Paused/Resumed/Stopped events as a timeline.
 *
 * A session paused three times is seven events long, so a flat list of
 * `[time] Label` lines stops being readable: the rail plus per-kind icons make
 * the pause/resume pairs scannable, and each line carries how long the stretch
 * it closes lasted, which is what makes a multi-pause session understandable
 * at a glance.
 */

const EVENT_STYLES: Record<RunLogEventKind, { Icon: typeof Play; dot: string; note: (span: string) => string }> = {
  start: { Icon: Play, dot: "bg-primary/15 text-primary", note: () => "" },
  pause: { Icon: Pause, dot: "bg-amber-500/15 text-amber-600 dark:text-amber-400", note: (span) => `ran ${span}` },
  resume: { Icon: RotateCcw, dot: "bg-primary/15 text-primary", note: (span) => `paused ${span}` },
  stop: { Icon: Square, dot: "bg-muted text-muted-foreground", note: (span) => `ran ${span}` },
  open: { Icon: Play, dot: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", note: () => "" },
};

/** Compact stretch length: `45s`, `12m`, `1h 05m`. */
function formatSpan(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${(minutes % 60).toString().padStart(2, "0")}m`;
}

function eventNote(event: RunLogEvent): string | null {
  if (event.spanSec === undefined) {
    return null;
  }
  return EVENT_STYLES[event.kind].note(formatSpan(event.spanSec)) || null;
}

interface RunEventLogProps {
  runs: readonly FormattableRun[];
  timeFormat: TimeFormat;
  className?: string;
}

export function RunEventLog({ runs, timeFormat, className }: RunEventLogProps) {
  const events = formatRunLog(runs, timeFormat);
  if (!events.length) {
    return null;
  }

  const pauseCount = events.filter((event) => event.kind === "pause").length;

  return (
    <div className={cn("space-y-1.5", className)}>
      <ol className="relative space-y-1 text-sm">
        {events.length > 1 ? (
          <span
            aria-hidden
            className="absolute left-[0.6875rem] top-3 bottom-3 w-px bg-gradient-to-b from-border via-border to-transparent"
          />
        ) : null}
        {events.map((event, index) => {
          const { Icon, dot } = EVENT_STYLES[event.kind];
          const note = eventNote(event);
          return (
            <li key={`${event.kind}-${index}`} className="relative flex items-center gap-2.5">
              <span className={cn("z-10 flex size-[1.375rem] shrink-0 items-center justify-center rounded-full", dot)}>
                <Icon className="size-3" strokeWidth={2.5} />
              </span>
              <span className="min-w-16 font-medium tabular-nums text-foreground">{event.time}</span>
              <span
                className={cn(
                  "text-muted-foreground",
                  event.kind === "open" && "font-medium text-emerald-600 dark:text-emerald-400",
                )}
              >
                {event.label}
              </span>
              {note ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{note}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {pauseCount > 0 ? (
        <p className="pl-8 text-xs text-muted-foreground">
          {pauseCount === 1 ? "1 pause" : `${pauseCount} pauses`} in this session
        </p>
      ) : null}
    </div>
  );
}
