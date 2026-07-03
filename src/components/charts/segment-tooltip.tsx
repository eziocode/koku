"use client";

import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import type { WorkLogSegment } from "@/lib/charts/segments";
import { formatDuration } from "@/lib/utils";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d, HH:mm");
}

interface SegmentTooltipCardProps {
  segment: WorkLogSegment;
}

/**
 * Rich, reusable tooltip body describing a single work log. Rendered both by
 * the Recharts tooltip and by hover interactions on custom segments so the
 * presentation stays identical everywhere.
 */
export function SegmentTooltipCard({ segment }: SegmentTooltipCardProps) {
  return (
    <div className="w-64 max-w-[80vw] space-y-2.5 rounded-xl border border-border/80 bg-popover p-3.5 text-popover-foreground shadow-xl shadow-foreground/10">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
          style={{ backgroundColor: segment.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{segment.title}</p>
          <p className="truncate text-xs text-muted-foreground">{segment.projectName}</p>
        </div>
      </div>

      {segment.description ? (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {segment.description}
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Start</dt>
        <dd className="text-right font-medium tabular-nums">{formatTime(segment.startAt)}</dd>
        <dt className="text-muted-foreground">End</dt>
        <dd className="text-right font-medium tabular-nums">{formatTime(segment.endAt)}</dd>
        <dt className="text-muted-foreground">Duration</dt>
        <dd className="text-right font-semibold tabular-nums">{formatDuration(segment.durationSec)}</dd>
        {segment.categoryName ? (
          <>
            <dt className="text-muted-foreground">Category</dt>
            <dd className="truncate text-right font-medium">{segment.categoryName}</dd>
          </>
        ) : null}
      </dl>

      {segment.tags.length ? (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {segment.tags.slice(0, 6).map((tag) => (
            <Badge key={tag} variant="secondary" className="px-2 py-0 text-[10px]">
              #{tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Recharts-compatible tooltip wrapper. Reads the hovered segment from payload. */
export function RechartsSegmentTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: unknown; dataKey?: string | number }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const first = payload[0];
  const row = first?.payload as { segments?: WorkLogSegment[] } | undefined;
  const dataKey = typeof first?.dataKey === "string" ? first.dataKey : "";
  const index = dataKey.startsWith("seg") ? Number(dataKey.slice(3)) : 0;
  const segment = row?.segments?.[index];

  if (!segment) {
    return null;
  }

  return <SegmentTooltipCard segment={segment} />;
}
