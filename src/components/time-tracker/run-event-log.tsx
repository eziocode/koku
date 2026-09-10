"use client";

import { ChevronDown, Clock3, Pause, Play, RotateCcw, Square } from "lucide-react";

import { useId, useMemo, useState, type ReactNode } from "react";

import {
  formatRunLog,
  summarizeRuns,
  type FormattableRun,
  type RunLogEvent,
  type RunLogEventKind,
} from "@/lib/charts/run-format";
import type { TimeFormat } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

/** Compact session summary with on-demand event history. */
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
  children?: ReactNode;
}

export function RunEventLog({ runs, timeFormat, className, children }: RunEventLogProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const summary = useMemo(() => summarizeRuns(runs, timeFormat), [runs, timeFormat]);
  const events = useMemo(() => expanded ? formatRunLog(runs, timeFormat) : [], [expanded, runs, timeFormat]);
  if (!summary) return children ?? null;

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Clock3 aria-hidden className="size-3.5 shrink-0" />
          <span><span className="sr-only">Session: </span>{summary.range}</span>
        </span>
        {summary.pauseCount > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>{summary.pauseCount} {summary.pauseCount === 1 ? "pause" : "pauses"}</span>
            {summary.pausedSec !== null ? <span>· {formatSpan(summary.pausedSec)} paused</span> : <span>· pause duration unavailable</span>}
          </span>
        ) : null}
        {runs.length > 1 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? "Hide timeline" : "Show timeline"}
            <ChevronDown aria-hidden className={cn("size-3.5", expanded && "rotate-180")} />
          </button>
        ) : null}
      </div>
      {children}
      {runs.length > 1 ? (
        <div id={panelId} hidden={!expanded}>
          {expanded ? (
            <ol aria-label="Session timeline" className="space-y-1 border-t border-border pt-3">
              {events.map((event, index) => {
                const { Icon, dot } = EVENT_STYLES[event.kind];
                const note = eventNote(event);
                return (
                  <li key={`${event.kind}-${index}`} className="relative grid grid-cols-[1.25rem_5.5rem_minmax(0,1fr)] items-center gap-x-2 text-xs sm:grid-cols-[1.25rem_5.5rem_4.5rem_minmax(0,1fr)]">
                    {index < events.length - 1 ? <span aria-hidden className="absolute bottom-[-0.25rem] left-[0.59375rem] top-5 w-px bg-border" /> : null}
                    <span aria-hidden className={cn("relative flex size-5 items-center justify-center rounded-full", dot)}>
                      <Icon className="size-2.5" strokeWidth={2.5} />
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{event.time}</span>
                    <span className={cn("text-muted-foreground", event.kind === "open" && "font-medium text-emerald-600 dark:text-emerald-400")}>
                      {event.label}
                    </span>
                    {note ? <span className="col-start-3 text-muted-foreground tabular-nums sm:col-start-auto">{note}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
