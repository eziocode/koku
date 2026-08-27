"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AssignmentBadge, StatusBadge } from "@/components/charts/status-badge";
import { Badge } from "@/components/ui/badge";
import type { WorkLogSegment } from "@/lib/charts/segments";
import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime as formatClockTime } from "@/lib/time-format";
import { formatDuration } from "@/lib/utils";

function formatTime(iso: string | null, timeFormat: TimeFormat): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatClockTime(date, timeFormat);
}

function formatRange(startAt: string, endAt: string | null, timeFormat: TimeFormat): string {
  const start = formatTime(startAt, timeFormat);
  if (!endAt) return `${start} → now`;
  return `${start} → ${formatTime(endAt, timeFormat)}`;
}

interface DayTooltipCardProps {
  /** Human day label, e.g. `Mon` or `Jun 3`. */
  label: string;
  segments: WorkLogSegment[];
  /** When set, the log matching this id is emphasised (the hovered segment). */
  activeSegmentId?: string;
  timeFormat?: TimeFormat;
}

/**
 * Rich, reusable tooltip body describing **every** work log for a day. Lists
 * the total count and, per log, its title, project, status, timing, duration,
 * and tags. The hovered log is emphasised.
 */
export function DayTooltipCard({ label, segments, activeSegmentId, timeFormat = "24h" }: DayTooltipCardProps) {
  if (!segments.length) return null;

  const totalSeconds = segments.reduce((sum, s) => sum + s.durationSec, 0);
  const runningCount = segments.filter((s) => s.status === "running").length;
  const pausedCount = segments.filter((s) => s.status === "paused").length;

  return (
    <div className="w-72 max-w-[86vw] overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-foreground/10">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5">
        <div>
          <p className="text-sm font-semibold leading-none">{label}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {segments.length} log{segments.length === 1 ? "" : "s"}
            {runningCount ? ` · ${runningCount} running` : ""}
            {pausedCount ? ` · ${pausedCount} paused` : ""}
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
                  {formatRange(segment.startAt, segment.endAt, timeFormat)}
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
 * How far to flip past the anchor: twice the chart's `Tooltip offset`, so a card
 * flipped to the left sits the same distance from the cursor as on the right.
 */
const FLIP_GAP = 56;

export interface TooltipPosition {
  left: number;
  top: number;
}

/**
 * Viewport coordinates for the tooltip card, given where Recharts anchored it.
 *
 * Flips to the left of the anchor when the card would run off the right edge, and
 * lifts it when it would run off the bottom. When there is no room on either side
 * it is nudged just far enough to fit, since a clipped card beats an off-screen
 * one. Pure so the placement rules are testable without a DOM.
 */
export function getTooltipPosition({
  anchor,
  size,
  viewportWidth,
  viewportHeight,
}: {
  anchor: { x: number; y: number };
  size: { width: number; height: number };
  viewportWidth: number;
  viewportHeight: number;
}): TooltipPosition {
  const rightLimit = viewportWidth - VIEWPORT_MARGIN;
  const bottomLimit = viewportHeight - VIEWPORT_MARGIN;

  let left = anchor.x;
  if (left + size.width > rightLimit) {
    left = anchor.x - FLIP_GAP - size.width;
    if (left < VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, rightLimit - size.width);
    }
  }

  let top = anchor.y;
  if (top + size.height > bottomLimit) {
    top = Math.max(VIEWPORT_MARGIN, bottomLimit - size.height);
  }

  return { left, top };
}

/**
 * Places the tooltip card in a `document.body` portal, positioned by hand.
 *
 * Recharts renders its tooltip inside the chart container, so a card next to a
 * bar at the panel's edge is clipped by the card's `overflow-hidden` and by its
 * bounds — `allowEscapeViewBox` moves the element but cannot escape an ancestor's
 * overflow. Portalling to the body with `position: fixed` does escape it, at the
 * cost of positioning the card ourselves.
 *
 * Recharts still renders the (empty, zero-size) anchor in place, which is what
 * tells us where it wanted the card: the anchor's own position already includes
 * the chart's `offset`. Because the anchor never changes size, none of this feeds
 * back into Recharts' own placement.
 */
function ViewportAwareTooltip({
  children,
  coordinate,
}: {
  children: ReactNode;
  /** Where Recharts has placed the card; re-measure when it moves. */
  coordinate?: { x?: number; y?: number };
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const coordinateX = coordinate?.x ?? 0;
  const coordinateY = coordinate?.y ?? 0;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const card = cardRef.current;
    if (!anchor || !card) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const next = getTooltipPosition({
      anchor: { x: anchorRect.left, y: anchorRect.top },
      size: { width: cardRect.width, height: cardRect.height },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setPosition((current) =>
      current && current.left === next.left && current.top === next.top ? current : next,
    );
  }, [coordinateX, coordinateY]);

  return (
    <>
      <div ref={anchorRef} style={{ width: 0, height: 0 }} />
      {createPortal(
        <div
          ref={cardRef}
          style={{
            position: "fixed",
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            zIndex: 60,
            pointerEvents: "none",
            // Hidden for the single layout pass that measures it, so the card is
            // never painted at the unpositioned origin.
            visibility: position ? "visible" : "hidden",
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Recharts-compatible tooltip wrapper. Reads all of a day's logs from payload. */
export function RechartsSegmentTooltip({
  active,
  payload,
  coordinate,
  activeSegmentId,
  showFullDay = false,
  timeFormat = "24h",
}: {
  active?: boolean;
  payload?: Array<{ payload?: unknown; dataKey?: string | number }>;
  coordinate?: { x?: number; y?: number };
  activeSegmentId?: string | null;
  showFullDay?: boolean;
  timeFormat?: TimeFormat;
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
        timeFormat={timeFormat}
      />
    </ViewportAwareTooltip>
  );
}
