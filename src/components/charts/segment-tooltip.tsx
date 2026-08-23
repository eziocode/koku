"use client";

import { format } from "date-fns";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { AssignmentBadge, StatusBadge } from "@/components/charts/status-badge";
import { Badge } from "@/components/ui/badge";
import type { WorkLogSegment } from "@/lib/charts/segments";
import { formatDuration } from "@/lib/utils";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "HH:mm");
}

function formatRange(startAt: string, endAt: string | null): string {
  const start = formatTime(startAt);
  if (!endAt) return `${start} → now`;
  return `${start} → ${formatTime(endAt)}`;
}

interface DayTooltipCardProps {
  /** Human day label, e.g. `Mon` or `Jun 3`. */
  label: string;
  segments: WorkLogSegment[];
  /** When set, the log matching this id is emphasised (the hovered segment). */
  activeSegmentId?: string;
}

/**
 * Rich, reusable tooltip body describing **every** work log for a day. Lists
 * the total count and, per log, its title, project, status, timing, duration,
 * and tags. The hovered log is emphasised.
 */
export function DayTooltipCard({ label, segments, activeSegmentId }: DayTooltipCardProps) {
  if (!segments.length) return null;

  const totalSeconds = segments.reduce((sum, s) => sum + s.durationSec, 0);
  const runningCount = segments.filter((s) => s.status === "running").length;

  return (
    <div className="w-72 max-w-[86vw] overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-foreground/10">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5">
        <div>
          <p className="text-sm font-semibold leading-none">{label}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {segments.length} log{segments.length === 1 ? "" : "s"}
            {runningCount ? ` · ${runningCount} running` : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatDuration(totalSeconds)}
        </span>
      </div>

      <ul className="max-h-64 space-y-2 overflow-y-auto p-2.5">
        {segments.map((segment) => {
          const active = segment.id === activeSegmentId;
          return (
            <li
              key={segment.id}
              className={[
                "rounded-lg border p-2.5 transition-colors",
                active
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 bg-muted/30",
              ].join(" ")}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">{segment.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{segment.projectName}</p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {formatDuration(segment.durationSec)}
                </span>
              </div>

              {segment.description ? (
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {segment.description}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={segment.status} />
                <AssignmentBadge assignment={segment.assignment} />
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatRange(segment.startAt, segment.endAt)}
                </span>
              </div>

              {segment.tags.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {segment.tags.slice(0, 5).map((tag) => (
                    <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Keep this much clear of the window edge. */
const VIEWPORT_MARGIN = 8;
/**
 * How far to flip past the cursor: twice the chart's `Tooltip offset`, so a card
 * flipped to the left sits the same distance from the cursor as on the right.
 */
const FLIP_GAP = 56;

export interface TooltipShift {
  x: number;
  y: number;
}

/**
 * The offset that keeps a tooltip on screen, flipping it to the left of the
 * cursor when it would otherwise run off the right edge.
 *
 * `rect` must be the card's *natural* position — where it sits before any shift
 * is applied. Feeding a shifted rect back in makes the result depend on its own
 * output, which is how this ends up oscillating rather than settling.
 */
export function getViewportShift({
  rect,
  viewportWidth,
  viewportHeight,
}: {
  rect: { left: number; right: number; top: number; bottom: number; width: number };
  viewportWidth: number;
  viewportHeight: number;
}): TooltipShift {
  const rightLimit = viewportWidth - VIEWPORT_MARGIN;
  const bottomLimit = viewportHeight - VIEWPORT_MARGIN;

  let x = 0;
  if (rect.right > rightLimit) {
    x = -(rect.width + FLIP_GAP);
    // Flipping must not push the card off the left edge instead: when there is
    // no room on either side, nudge it just far enough to fit.
    if (rect.left + x < VIEWPORT_MARGIN) {
      x = Math.min(0, rightLimit - rect.right);
    }
  }

  let y = 0;
  if (rect.bottom > bottomLimit) {
    y = bottomLimit - rect.bottom;
    if (rect.top + y < VIEWPORT_MARGIN) {
      y = VIEWPORT_MARGIN - rect.top;
    }
  }

  return { x, y };
}

/**
 * Flips the tooltip to the other side of the cursor when it would run off screen.
 *
 * The chart sets `allowEscapeViewBox`, which is what lets a tall tooltip show
 * beside a bar near the panel edge — but it also means Recharts will happily
 * place the card past the window edge, which is where the rightmost columns of a
 * chart in a right-hand panel put it. Recharts has no viewport-aware placement,
 * so the card corrects its own position.
 *
 * Two things keep this from looping. The measured element is the *outer* wrapper
 * and the transform goes on the inner one: a transform does not affect layout, so
 * the measurement is always of the natural position and never of the correction
 * already applied. And because the outer box never changes size, Recharts' own
 * size-based repositioning is not retriggered — that feedback loop was what blew
 * the update depth.
 */
function ViewportAwareTooltip({
  children,
  coordinate,
}: {
  children: ReactNode;
  /** Where Recharts has placed the card; re-measure when it moves. */
  coordinate?: { x?: number; y?: number };
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState<TooltipShift>({ x: 0, y: 0 });
  const coordinateX = coordinate?.x ?? 0;
  const coordinateY = coordinate?.y ?? 0;

  useLayoutEffect(() => {
    const element = outerRef.current;
    if (!element || typeof window === "undefined") {
      return;
    }

    const next = getViewportShift({
      rect: element.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setShift((current) => (current.x === next.x && current.y === next.y ? current : next));
  }, [coordinateX, coordinateY]);

  return (
    <div ref={outerRef}>
      <div
        style={{
          transform: shift.x || shift.y ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Recharts-compatible tooltip wrapper. Reads all of a day's logs from payload. */
export function RechartsSegmentTooltip({
  active,
  payload,
  coordinate,
  activeSegmentId,
  showFullDay = false,
}: {
  active?: boolean;
  payload?: Array<{ payload?: unknown; dataKey?: string | number }>;
  coordinate?: { x?: number; y?: number };
  activeSegmentId?: string | null;
  showFullDay?: boolean;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const first = payload[0];
  const row = first?.payload as { label?: string; segments?: WorkLogSegment[] } | undefined;
  const segments = row?.segments ?? [];
  if (!segments.length) {
    return null;
  }

  const dataKey = typeof first?.dataKey === "string" ? first.dataKey : "";
  const index = dataKey.startsWith("seg") ? Number(dataKey.slice(3)) : -1;
  const fallbackSegmentId = index >= 0 ? segments[index]?.id : undefined;
  const targetedSegmentId = activeSegmentId ?? fallbackSegmentId;
  const tooltipSegments =
    targetedSegmentId && !showFullDay
      ? segments.filter((segment) => segment.id === targetedSegmentId)
      : segments;

  return (
    <ViewportAwareTooltip coordinate={coordinate}>
      <DayTooltipCard
        label={row?.label ?? ""}
        segments={tooltipSegments.length ? tooltipSegments : segments}
        activeSegmentId={targetedSegmentId}
      />
    </ViewportAwareTooltip>
  );
}
