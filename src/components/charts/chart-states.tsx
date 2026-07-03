"use client";

import { AlertTriangle, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StateProps {
  className?: string;
  /** Chart height so the placeholder matches the eventual chart footprint. */
  height?: number;
}

/** Animated skeleton that mirrors a bar-chart footprint while data loads. */
export function ChartLoading({ className, height = 288 }: StateProps) {
  const bars = [0.5, 0.8, 0.4, 0.95, 0.65, 0.75, 0.55];
  return (
    <div
      className={cn("flex w-full items-end gap-3 px-2", className)}
      style={{ height }}
      role="status"
      aria-label="Loading chart"
    >
      {bars.map((fraction, index) => (
        <Skeleton
          key={index}
          className="flex-1 rounded-t-md"
          style={{ height: `${fraction * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Friendly empty state with an icon and optional call-to-action. */
export function ChartEmpty({
  className,
  height = 288,
  title = "No activity yet",
  description = "Track some time to see it visualised here.",
  action,
}: StateProps & { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center",
        className,
      )}
      style={{ height }}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BarChart3 className="h-6 w-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Error state with a retry affordance. */
export function ChartError({
  className,
  height = 288,
  message = "Something went wrong loading this chart.",
  onRetry,
}: StateProps & { message?: string; onRetry?: () => void }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 text-center",
        className,
      )}
      style={{ height }}
      role="alert"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <p className="max-w-xs text-sm text-destructive">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
