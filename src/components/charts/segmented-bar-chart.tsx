"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChartEmpty } from "@/components/charts/chart-states";
import { DayTooltipCard, getTooltipPosition } from "@/components/charts/segment-tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NON_WORKING_COLORS } from "@/lib/charts/theme";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { cn } from "@/lib/utils";
import type { TimeFormat } from "@/lib/settings/schema";
import type { SegmentedDay, WorkLogSegment } from "@/lib/charts/segments";

/** Fraction-of-24h below which two blocks are treated as touching, not gapped. */
const EPS_HOURS = 0.01;

/** Gridline hours. Always every 3h — thin lines never collide. */
const GRIDLINE_HOURS = [3, 6, 9, 12, 15, 18, 21];

/**
 * Candidate label spacings, densest first, and the minimum track width each
 * needs. A `12 AM`-style label is ~46px, so a tick every 3h needs ~8×46px of
 * track before the labels start touching; narrower tracks step up to 6h then
 * 12h rather than overprinting.
 */
const RULER_STEPS = [
  { step: 3, minWidth: 520 },
  { step: 6, minWidth: 260 },
  { step: 12, minWidth: 0 },
];

function rulerHoursFor(trackWidth: number): number[] {
  const { step } = RULER_STEPS.find((candidate) => trackWidth >= candidate.minWidth) ?? RULER_STEPS[RULER_STEPS.length - 1];
  const hours: number[] = [];
  for (let hour = 0; hour <= 24; hour += step) hours.push(hour);
  return hours;
}

/**
 * Row metrics, kept in sync with the row markup below (`py-*` + track height)
 * and the `space-y-1` gap between rows. Used to size the scroll frame to its
 * content instead of a fixed guess.
 */
const ROW_HEIGHT_COMPACT = 18;
const ROW_HEIGHT_REGULAR = 36;
const ROW_GAP = 4;

/** Past this many rows the frame stops growing and the list scrolls. */
const MAX_VISIBLE_ROWS = 12;

function hourOfDay(iso: string): number {
  const date = new Date(iso);
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function formatClockHour(hour: number, timeFormat: TimeFormat): string {
  const clamped = Math.max(0, Math.min(24, hour));
  const wholeMinutes = Math.round(clamped * 60);
  const h = Math.floor(wholeMinutes / 60) % 24;
  const m = wholeMinutes % 60;

  if (timeFormat === "24h") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Compact ruler label — drops the always-`:00` minutes so the axis reads
 * `9 AM` / `09:00` rather than `9:00 AM`, which crowds at this tick density.
 */
function formatRulerHour(hour: number, timeFormat: TimeFormat): string {
  const h = hour % 24;

  if (timeFormat === "24h") {
    return `${String(h).padStart(2, "0")}:00`;
  }

  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour} ${period}`;
}

function hoursMinutesLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Local-timezone `yyyy-MM-dd`, matching `SegmentedDay.key`'s date-fns format. */
function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface WorkBlock {
  kind: "work";
  from: number;
  to: number;
  segment: WorkLogSegment;
}
interface GapBlock {
  kind: "gap";
  from: number;
  to: number;
}
type TimelineBlock = WorkBlock | GapBlock;

/**
 * Lays each day's segments onto a 0–24h track. Gaps *between* two logged
 * segments become a hoverable "no log found" block; the empty stretch before
 * the first log and after the last log is left bare on purpose — there is
 * nothing to explain about time nobody claimed to be working.
 */
function buildDayBlocks(day: SegmentedDay): TimelineBlock[] {
  const sorted = [...day.segments].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const blocks: TimelineBlock[] = [];
  let cursor = 0;

  sorted.forEach((segment, index) => {
    const start = Math.max(0, Math.min(24, hourOfDay(segment.startAt)));
    const end = Math.max(start, Math.min(24, start + segment.hours));
    if (index > 0 && start > cursor + EPS_HOURS) {
      blocks.push({ kind: "gap", from: cursor, to: start });
    }
    blocks.push({ kind: "work", from: start, to: end, segment });
    cursor = Math.max(cursor, end);
  });

  return blocks;
}

/**
 * Width thresholds for the non-working marker. Below `LABEL_MIN_TRACK` the pill
 * would eat most of the track, so the marker degrades to the bare rule plus its
 * end dots — the reason still reachable via the row's date-column dot and the
 * screen-reader table.
 */
const MARKER_LABEL_MIN_TRACK = 150;
const MARKER_SHORT_LABEL_MIN_TRACK = 260;

/** Longest label rendered in full below `MARKER_SHORT_LABEL_MIN_TRACK`. */
const MARKER_SHORT_LABEL_CHARS = 10;

/**
 * Pill box sized *under* the track height it sits in (14px compact / 24px
 * regular) so it can never spill into the rows above and below. Height is fixed
 * rather than padding-derived: padding plus a border on a 14px track overflows.
 */
const MARKER_PILL = {
  compact: { height: 12, className: "px-1 text-[9px]" },
  regular: { height: 18, className: "px-2 text-[11px]" },
} as const;

function shortenMarkerLabel(label: string): string {
  if (label.length <= MARKER_SHORT_LABEL_CHARS) return label;
  return `${label.slice(0, MARKER_SHORT_LABEL_CHARS - 1).trimEnd()}…`;
}

/**
 * A day nobody was expected to work: drawn as a single rule across the whole
 * track with the reason centred on it, rather than the empty track an ordinary
 * zero-hour day gets. The two read differently on purpose — one is a day off,
 * the other is a day with nothing logged.
 *
 * The pill adapts to the measured track width — full label, shortened label, or
 * rule only — so a narrow panel or a long holiday name never blows the marker
 * past the track it belongs to.
 */
function NonWorkingTrack({
  label,
  color,
  compact,
  trackWidth,
}: {
  label: string;
  color: string;
  compact: boolean;
  /** Measured px width of the track. 0 before first measure — treated as roomy. */
  trackWidth: number;
}) {
  const measured = trackWidth > 0;
  const showLabel = !measured || trackWidth >= MARKER_LABEL_MIN_TRACK;
  const displayLabel =
    !measured || trackWidth >= MARKER_SHORT_LABEL_MIN_TRACK ? label : shortenMarkerLabel(label);
  const pill = MARKER_PILL[compact ? "compact" : "regular"];

  return (
    <div className="absolute inset-0 flex items-center overflow-hidden" aria-hidden title={label}>
      <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
      <span className="mx-1 h-px min-w-0 flex-1" style={{ backgroundColor: color }} />
      {showLabel ? (
        <>
          <span
            className={cn(
              "flex max-w-[60%] shrink items-center justify-center rounded border bg-background font-medium leading-none",
              pill.className,
            )}
            style={{ height: pill.height, borderColor: color, color }}
          >
            <span className="truncate">{displayLabel}</span>
          </span>
          <span className="mx-1 h-px min-w-0 flex-1" style={{ backgroundColor: color }} />
        </>
      ) : null}
      <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
    </div>
  );
}

/** Portals a `DayTooltipCard` to `document.body`, positioned near the cursor. */
function SegmentTooltipPortal({
  label,
  segment,
  anchor,
}: {
  label: string;
  segment: WorkLogSegment;
  anchor: { x: number; y: number };
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setPosition(
      getTooltipPosition({
        anchor,
        size: { width: rect.width, height: rect.height },
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }, [anchor]);

  return createPortal(
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        zIndex: 60,
        pointerEvents: "none",
        visibility: position ? "visible" : "hidden",
      }}
    >
      <DayTooltipCard label={label} segments={[segment]} activeSegmentId={segment.id} />
    </div>,
    document.body,
  );
}

interface SegmentedBarChartProps {
  days: SegmentedDay[];
  /** Scroll-area height. Defaults to a size that suits the row density. */
  height?: number;
  /** Fired when a segment is clicked — use to navigate to / filter the work log. */
  onSegmentClick?: (segment: WorkLogSegment) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * Slimmer rows and tighter type, for a narrow panel like the dashboard's
   * "This week" card where the full-size track wastes the little width it has.
   */
  compact?: boolean;
}

/**
 * Attendance-style daily timeline: one row per day, each row a 0–24h track with
 * a coloured bar wherever a work log ran. Hovering a log shows its details;
 * hovering an interior gap between two logs shows "no log found" for that
 * stretch. Time before the first log and after the last is left unmarked.
 */
export function SegmentedBarChart({
  days,
  height,
  onSegmentClick,
  emptyTitle,
  emptyDescription,
  compact = false,
}: SegmentedBarChartProps) {
  // Estimated frame height, used until the rows have been measured (and as the
  // empty state's footprint). Row metrics mirror the row markup below.
  const rowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_REGULAR;
  const estimatedRows = Math.min(Math.max(days.length, 1), MAX_VISIBLE_ROWS);
  const estimatedHeight = estimatedRows * rowHeight + (estimatedRows - 1) * ROW_GAP;
  const maxFrameHeight = MAX_VISIBLE_ROWS * rowHeight + (MAX_VISIBLE_ROWS - 1) * ROW_GAP;
  const [hovered, setHovered] = useState<{
    dayLabel: string;
    segment: WorkLogSegment;
    x: number;
    y: number;
  } | null>(null);

  const { value: timeFormat } = useTypedSetting("timeFormat");

  // A holiday or week-off marker is data too: a month whose only story is "these
  // days were off" should tell it, not fall back to "no activity".
  const hasData = useMemo(
    () => days.some((day) => day.segments.length > 0 || day.nonWorking),
    [days],
  );
  const now = useMemo(() => hourOfDay(new Date().toISOString()), []);
  const todayKey = useMemo(() => localDateKey(new Date()), []);

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const todayRowRef = useRef<HTMLDivElement | null>(null);
  const centeredOnceRef = useRef(false);

  // Label density is chosen from the measured track width so a narrow panel
  // (the dashboard's "This week" card, a resized window) thins the ticks out
  // instead of printing them on top of each other.
  const rulerTrackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // The frame is sized from the rows it actually renders rather than a fixed
  // box, so a seven-day week and a thirty-day month do not share one height
  // with either of them stranded in empty space. Measured (not just computed
  // from row metrics) so it stays right if the row markup changes.
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const [measuredRowsHeight, setMeasuredRowsHeight] = useState(0);

  // Depends on `hasData`: the ruler is not in the tree while the empty state is
  // showing, so without re-running the observer would never attach and the
  // width would stay 0 (collapsing the axis to its sparsest step forever).
  useEffect(() => {
    const track = rulerTrackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(([entry]) => {
      setTrackWidth(entry.contentRect.width);
    });
    observer.observe(track);
    setTrackWidth(track.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [hasData]);

  const rulerHours = useMemo(() => rulerHoursFor(trackWidth), [trackWidth]);

  useEffect(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    const observer = new ResizeObserver(([entry]) => {
      setMeasuredRowsHeight(entry.contentRect.height);
    });
    observer.observe(rows);
    setMeasuredRowsHeight(rows.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [hasData]);

  const frameHeight =
    height ?? Math.min(measuredRowsHeight || estimatedHeight, maxFrameHeight);

  // Land on today once data is in, then leave scroll position to the user —
  // re-centering on every re-render (a live timer ticks `days` every second)
  // would fight anyone who scrolled away to look at an earlier day.
  useEffect(() => {
    if (centeredOnceRef.current) return;
    const row = todayRowRef.current;
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!row || !viewport) return;
    const target = row.offsetTop - viewport.clientHeight / 2 + row.clientHeight / 2;
    viewport.scrollTop = Math.max(0, target);
    centeredOnceRef.current = true;
  }, [days]);

  if (!hasData) {
    // The empty card needs room for its icon and copy — a short week's worth
    // of rows would crush it.
    return <ChartEmpty height={Math.max(frameHeight, 180)} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="w-full">
      {/* Hour ruler. Gutters match each row's day label and total columns so the
          ticks line up with the tracks below. */}
      <div className={cn("flex items-end pr-2", compact ? "gap-2" : "gap-3")}>
        <div className={cn("shrink-0", compact ? "w-11" : "w-14")} aria-hidden />
        <div ref={rulerTrackRef} className="relative h-4 flex-1">
          {rulerHours.map((hour) => (
            <span
              key={hour}
              className={cn(
                "absolute bottom-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground",
                hour === 0 && "translate-x-0",
                hour === 24 && "-translate-x-full",
                hour !== 0 && hour !== 24 && "-translate-x-1/2",
              )}
              style={{ left: `${(hour / 24) * 100}%` }}
            >
              {formatRulerHour(hour, timeFormat)}
            </span>
          ))}
        </div>
        <div className={cn("shrink-0", compact ? "w-12" : "w-16")} aria-hidden />
      </div>

      <ScrollArea ref={scrollAreaRef} style={{ height: frameHeight }}>
        <div ref={rowsRef} className="space-y-1 pr-2">
          {days.map((day) => {
            const blocks = buildDayBlocks(day);
            const isToday = day.key === todayKey;
            const marker = day.nonWorking;
            const markerColor = marker ? NON_WORKING_COLORS[marker.kind] : null;
            // The marker replaces the track only when there is nothing to draw
            // on it: work logged on a holiday still gets its blocks, with the
            // day merely flagged beside the date.
            const markerOnly = Boolean(marker) && day.segments.length === 0;
            return (
              <div
                key={day.key}
                ref={isToday ? todayRowRef : undefined}
                className={cn(
                  "flex items-center rounded-lg",
                  compact ? "gap-2 py-0.5" : "gap-3 py-1.5",
                  isToday && "border-y border-dashed border-primary/60 bg-primary/5",
                )}
              >
                <p
                  className={cn(
                    "flex shrink-0 items-center justify-end gap-1 text-right font-medium text-muted-foreground",
                    compact ? "w-11 text-[10px]" : "w-14 text-xs",
                    isToday && "text-primary",
                  )}
                >
                  {marker && !markerOnly ? (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: markerColor ?? undefined }}
                      title={marker.label}
                    />
                  ) : null}
                  {isToday ? "Today" : day.label}
                </p>
                <div
                  className={cn(
                    "relative flex-1 rounded-sm",
                    markerOnly ? "bg-transparent" : "bg-muted/20",
                    compact ? "h-3.5" : "h-6",
                  )}
                >
                  {/* Hour gridlines, kept at 3h regardless of label density. */}
                  {markerOnly ? null : GRIDLINE_HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="pointer-events-none absolute inset-y-0 w-px bg-border/50"
                      style={{ left: `${(hour / 24) * 100}%` }}
                      aria-hidden
                    />
                  ))}
                  {markerOnly ? null : (
                    <div
                      className="pointer-events-none absolute inset-y-0 border-l border-dashed border-primary/50"
                      style={{ left: `${(now / 24) * 100}%` }}
                      aria-hidden
                    />
                  )}
                  {markerOnly && marker && markerColor ? (
                    <NonWorkingTrack
                      label={marker.label}
                      color={markerColor}
                      compact={compact}
                      trackWidth={trackWidth}
                    />
                  ) : null}
                  {blocks.map((block) =>
                    block.kind === "work" ? (
                      <button
                        key={block.segment.id}
                        type="button"
                        className={cn(
                          // Rectangular candle, not a pill: a rounded cap on a
                          // short block reads as a blob and hides where the log
                          // actually starts and ends on the hour axis.
                          "absolute inset-y-0 rounded-[2px] transition-[filter]",
                          block.segment.status === "running" && "animate-pulse",
                          onSegmentClick && "cursor-pointer hover:brightness-110",
                        )}
                        style={{
                          left: `${(block.from / 24) * 100}%`,
                          width: `${Math.max(0.6, ((block.to - block.from) / 24) * 100)}%`,
                          backgroundColor: block.segment.color,
                          opacity: block.segment.status === "running" ? 0.85 : 1,
                        }}
                        onMouseEnter={(event) =>
                          setHovered({
                            dayLabel: day.label,
                            segment: block.segment,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                        onMouseMove={(event) =>
                          setHovered((current) =>
                            current && current.segment.id === block.segment.id
                              ? { ...current, x: event.clientX, y: event.clientY }
                              : current,
                          )
                        }
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onSegmentClick?.(block.segment)}
                      />
                    ) : (
                      <div
                        key={`${day.key}-gap-${block.from}`}
                        tabIndex={0}
                        role="note"
                        title={`No log found · ${formatClockHour(block.from, timeFormat)} – ${formatClockHour(block.to, timeFormat)}`}
                        aria-label={`No log found from ${formatClockHour(block.from, timeFormat)} to ${formatClockHour(block.to, timeFormat)}`}
                        className="absolute inset-y-0 cursor-help rounded-[2px] bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--color-muted-foreground)_35%,transparent)_0,color-mix(in_srgb,var(--color-muted-foreground)_35%,transparent)_2px,transparent_2px,transparent_6px)]"
                        style={{
                          left: `${(block.from / 24) * 100}%`,
                          width: `${((block.to - block.from) / 24) * 100}%`,
                        }}
                      />
                    ),
                  )}
                </div>
                <p
                  className={cn(
                    "shrink-0 text-right tabular-nums text-muted-foreground",
                    compact ? "w-12 text-[10px]" : "w-16 text-xs",
                  )}
                >
                  {markerOnly ? "—" : hoursMinutesLabel(day.totalSeconds)}
                </p>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {hovered ? (
        <SegmentTooltipPortal
          label={hovered.dayLabel}
          segment={hovered.segment}
          anchor={{ x: hovered.x + 16, y: hovered.y + 16 }}
        />
      ) : null}

      {/* Accessible, screen-reader-only equivalent of the chart data. */}
      <table className="sr-only">
        <caption>Daily activity — work logs grouped by day.</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Work log</th>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col">Assignment</th>
            <th scope="col">Start</th>
            <th scope="col">End</th>
          </tr>
        </thead>
        <tbody>
          {days.flatMap((day) =>
            day.segments.length === 0 && day.nonWorking
              ? [
                  <tr key={`${day.key}-non-working`}>
                    <td>{day.label}</td>
                    <td>{day.nonWorking.label}</td>
                    <td>—</td>
                    <td>{day.nonWorking.kind}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>,
                ]
              : day.segments.map((segment) => (
              <tr key={`${day.key}-${segment.id}`}>
                <td>{day.label}</td>
                <td>{segment.title}</td>
                <td>{segment.projectName}</td>
                <td>{segment.status}</td>
                <td>{segment.assignment}</td>
                <td>{segment.startAt}</td>
                <td>{segment.endAt ?? "running"}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
