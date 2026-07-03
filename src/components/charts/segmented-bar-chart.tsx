"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartEmpty } from "@/components/charts/chart-states";
import { RechartsSegmentTooltip } from "@/components/charts/segment-tooltip";
import { CHART_TOKENS } from "@/lib/charts/theme";
import { formatDuration } from "@/lib/utils";
import { toStackedRows, type SegmentedDay, type StackedRow, type WorkLogSegment } from "@/lib/charts/segments";

/**
 * Custom bar shape that rounds only the topmost non-empty segment of each day's
 * stack, marks running logs with an animated shimmer + live outline, and gives
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
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, segIndex, payload } = props;
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
    <g>
      <path
        d={path}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={isUnassigned ? "color-mix(in srgb, var(--color-foreground) 45%, transparent)" : "none"}
        strokeWidth={isUnassigned ? 1 : 0}
        strokeDasharray={isUnassigned ? "3 3" : undefined}
      />
      {isRunning ? (
        <>
          {/* Live shimmer overlay for the running segment. */}
          <foreignObject x={x} y={y} width={width} height={height} pointerEvents="none">
            <div
              className="koku-live-shimmer h-full w-full"
              style={{ borderRadius: isTop ? `${r}px ${r}px 0 0` : 0 }}
            />
          </foreignObject>
          {/* Pulsing outline to signal the active state. */}
          <path
            d={path}
            fill="none"
            stroke={fill}
            strokeWidth={2}
            className="koku-live-shimmer"
            opacity={0.9}
          />
        </>
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

/**
 * Segmented, stacked daily-activity bar chart.
 *
 * Each day is a column; each work log within that day is a differently coloured
 * stacked segment whose height is proportional to its duration. Running logs
 * shimmer with a live indicator, unassigned logs get a dashed outline, and
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

  const hasData = useMemo(() => days.some((day) => day.segments.length > 0), [days]);

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
            content={<RechartsSegmentTooltip />}
            cursor={{ fill: CHART_TOKENS.cursor, radius: 6 }}
            wrapperStyle={{ outline: "none", zIndex: 50 }}
          />
          {Array.from({ length: maxSegments }).map((_, segIndex) => {
            const dataKey = `seg${segIndex}`;
            return (
              <Bar
                key={dataKey}
                dataKey={dataKey}
                stackId="day"
                animationDuration={CHART_TOKENS.animationDuration}
                shape={(shapeProps: object) => <RoundedSegment {...shapeProps} segIndex={segIndex} />}
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
