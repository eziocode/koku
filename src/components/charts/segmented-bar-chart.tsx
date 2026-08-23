"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartEmpty } from "@/components/charts/chart-states";
import { RechartsSegmentTooltip } from "@/components/charts/segment-tooltip";
import { CHART_TOKENS } from "@/lib/charts/theme";
import { formatDuration } from "@/lib/utils";
import { toStackedRows, type SegmentedDay, type StackedRow, type WorkLogSegment } from "@/lib/charts/segments";

/**
 * Custom bar shape that rounds only the topmost non-empty segment of each day's
 * stack, marks running logs with a pulsing live outline, and gives
 * unassigned logs a dashed outline so they read differently from assigned work.
 */
function RoundedSegment(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
  segIndex: number;
  payload?: StackedRow;
  onHoverSegment?: (segment: WorkLogSegment, height: number) => void;
  onLeaveSegment?: () => void;
}) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    fill,
    fillOpacity,
    segIndex,
    payload,
    onHoverSegment,
    onLeaveSegment,
  } = props;
  if (height <= 0 || width <= 0) {
    return null;
  }
  const segment = payload?.segments?.[segIndex];
  const r = Math.min(CHART_TOKENS.radius, width / 2, height);
  const isTop = payload?.topSegmentIndex === segIndex;
  const path = isTop
    ? `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`
    : `M${x},${y} h${width} v${height} h${-width} Z`;

  const isRunning = segment?.status === "running";
  const isUnassigned = segment?.assignment === "unassigned";

  return (
    <g
      onMouseEnter={() => {
        if (segment) {
          onHoverSegment?.(segment, height);
        }
      }}
      onMouseLeave={onLeaveSegment}
      style={{ cursor: segment ? "pointer" : undefined }}
    >
      <path
        d={path}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={isUnassigned ? "color-mix(in srgb, var(--color-foreground) 45%, transparent)" : "none"}
        strokeWidth={isUnassigned ? 1 : 0}
        strokeDasharray={isUnassigned ? "3 3" : undefined}
      />
      {isRunning ? (
        // One pulsing outline, nothing layered inside the bar: the running
        // segment re-renders every second as its duration ticks up, so anything
        // heavier here repaints continuously and reads as stutter.
        <path d={path} fill="none" stroke={fill} strokeWidth={2} className="koku-live-outline" />
      ) : null}
    </g>
  );
}

interface SegmentedBarChartProps {
  days: SegmentedDay[];
  height?: number;
  /** Fired when a segment is clicked — use to navigate to / filter the work log. */
  onSegmentClick?: (segment: WorkLogSegment) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

const TINY_SEGMENT_TOOLTIP_HEIGHT = 12;

/**
 * Segmented, stacked daily-activity bar chart.
 *
 * Each day is a column; each work log within that day is a differently coloured
 * stacked segment whose height is proportional to its duration. Running logs
 * carry a pulsing outline, unassigned logs get a dashed outline, and
 * hovering a column shows a rich tooltip listing every log for that day.
 */
export function SegmentedBarChart({
  days,
  height = 288,
  onSegmentClick,
  emptyTitle,
  emptyDescription,
}: SegmentedBarChartProps) {
  const { rows, maxSegments } = useMemo(() => toStackedRows(days), [days]);
  // Bars grow in once, on mount. Leaving the animation on makes every live-timer
  // tick replay it, so the whole chart appears to lurch once a second.
  const [animateBars, setAnimateBars] = useState(true);
  const [hoveredSegment, setHoveredSegment] = useState<{
    id: string;
    showFullDay: boolean;
  } | null>(null);

  const hasData = useMemo(() => days.some((day) => day.segments.length > 0), [days]);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimateBars(false), CHART_TOKENS.animationDuration);
    return () => clearTimeout(timeout);
  }, []);

  if (!hasData) {
    return <ChartEmpty height={height} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -12 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={CHART_TOKENS.grid} strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            stroke={CHART_TOKENS.axis}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            dy={6}
          />
          <YAxis
            stroke={CHART_TOKENS.axis}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={44}
            tickFormatter={(value: number) => `${value}h`}
          />
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            content={
              <RechartsSegmentTooltip
                activeSegmentId={hoveredSegment?.id}
                showFullDay={hoveredSegment ? hoveredSegment.showFullDay : true}
              />
            }
            cursor={{ fill: CHART_TOKENS.cursor, radius: 6 }}
            offset={28}
            wrapperStyle={{ outline: "none", pointerEvents: "none", zIndex: 50 }}
          />
          {Array.from({ length: maxSegments }).map((_, segIndex) => {
            const dataKey = `seg${segIndex}`;
            return (
              <Bar
                key={dataKey}
                dataKey={dataKey}
                stackId="day"
                isAnimationActive={animateBars}
                animationDuration={CHART_TOKENS.animationDuration}
                shape={(shapeProps: object) => (
                  <RoundedSegment
                    {...shapeProps}
                    segIndex={segIndex}
                    onHoverSegment={(segment, renderedHeight) => {
                      setHoveredSegment({
                        id: segment.id,
                        showFullDay: renderedHeight < TINY_SEGMENT_TOOLTIP_HEIGHT,
                      });
                    }}
                    onLeaveSegment={() => setHoveredSegment(null)}
                  />
                )}
                onClick={(data: unknown) => {
                  const payload = (data as { payload?: { segments?: WorkLogSegment[] } })?.payload;
                  const segment = payload?.segments?.[segIndex];
                  if (segment && onSegmentClick) {
                    onSegmentClick(segment);
                  }
                }}
                cursor={onSegmentClick ? "pointer" : undefined}
              >
                {rows.map((row) => {
                  const segment = row.segments[segIndex];
                  return (
                    <Cell
                      key={row.key}
                      fill={segment?.color ?? "transparent"}
                      fillOpacity={segment ? (segment.status === "running" ? 0.72 : 0.92) : 0}
                    />
                  );
                })}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>

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
            <th scope="col">Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) =>
            row.segments.map((segment) => (
              <tr key={`${row.key}-${segment.id}`}>
                <td>{row.label}</td>
                <td>{segment.title}</td>
                <td>{segment.projectName}</td>
                <td>{segment.status}</td>
                <td>{segment.assignment}</td>
                <td>{formatDuration(segment.durationSec)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
