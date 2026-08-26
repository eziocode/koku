"use client";

/**
 * @deprecated Superseded by `SegmentedBarChart`, which renders per-work-log
 * segments instead of an aggregated total. This shim adapts the old
 * `{ label, hours }[]` API to a single-segment-per-day stacked chart so any
 * remaining callers keep working. New code should use `SegmentedBarChart`.
 */

import { SegmentedBarChart } from "@/components/charts/segmented-bar-chart";
import { UNASSIGNED_COLOR } from "@/lib/charts/theme";
import type { SegmentedDay } from "@/lib/charts/segments";

interface DailyBarChartProps {
  data: Array<{ label: string; hours: number }>;
}

export function DailyBarChart({ data }: DailyBarChartProps) {
  const days: SegmentedDay[] = data.map((point, index) => {
    const seconds = Math.round(point.hours * 3600);
    return {
      key: `${point.label}-${index}`,
      label: point.label,
      totalSeconds: seconds,
      totalHours: point.hours,
      hasRunning: false,
      hasPaused: false,
      nonWorking: null,
      segments: point.hours
        ? [
            {
              id: `${point.label}-${index}`,
              entryId: `${point.label}-${index}`,
              title: point.label,
              description: null,
              projectId: null,
              projectName: "Total",
              categoryName: null,
              color: UNASSIGNED_COLOR,
              startAt: "",
              endAt: null,
              durationSec: seconds,
              hours: point.hours,
              tags: [],
              status: "completed" as const,
              assignment: "unassigned" as const,
              isPartial: false,
              continuedFromPreviousDay: false,
              continuesNextDay: false,
            },
          ]
        : [],
    };
  });

  return <SegmentedBarChart days={days} />;
}
