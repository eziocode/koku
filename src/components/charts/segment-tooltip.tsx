"use client";

import { format } from "date-fns";

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

/** Recharts-compatible tooltip wrapper. Reads all of a day's logs from payload. */
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
  const row = first?.payload as { label?: string; segments?: WorkLogSegment[] } | undefined;
  const segments = row?.segments ?? [];
  if (!segments.length) {
    return null;
  }

  const dataKey = typeof first?.dataKey === "string" ? first.dataKey : "";
  const index = dataKey.startsWith("seg") ? Number(dataKey.slice(3)) : -1;
  const activeSegmentId = index >= 0 ? segments[index]?.id : undefined;

  return <DayTooltipCard label={row?.label ?? ""} segments={segments} activeSegmentId={activeSegmentId} />;
}
