"use client";

import { CheckCircle2, CircleDashed, Loader2, Pause, User, UserX, XCircle } from "lucide-react";
import type { CSSProperties, ComponentType } from "react";

import type { AssignmentState, WorkLogStatus } from "@/lib/charts/segments";
import { getStatusColor } from "@/lib/charts/theme";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; style?: CSSProperties }>;

const STATUS_META: Record<WorkLogStatus, { label: string; Icon: IconType }> = {
  completed: { label: "Completed", Icon: CheckCircle2 },
  running: { label: "Running", Icon: Loader2 },
  paused: { label: "Paused", Icon: Pause },
  pending: { label: "Pending", Icon: CircleDashed },
  failed: { label: "Failed", Icon: XCircle },
};

const ASSIGNMENT_META: Record<AssignmentState, { label: string; Icon: IconType }> = {
  assigned: { label: "Assigned", Icon: User },
  unassigned: { label: "Unassigned", Icon: UserX },
};

interface StatusBadgeProps {
  status: WorkLogStatus;
  className?: string;
  /** When true, hides the text label and shows only the icon/dot. */
  compact?: boolean;
}

/**
 * Consistent status pill used across the tooltip and reports. Running status
 * gets a subtle pulsing dot + spinning icon to convey live progress.
 */
export function StatusBadge({ status, className, compact }: StatusBadgeProps) {
  const { label, Icon } = STATUS_META[status];
  const color = getStatusColor(status);
  const isRunning = status === "running";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {isRunning ? (
        <span className="koku-live-dot" aria-hidden />
      ) : (
        <Icon className="h-3 w-3" aria-hidden />
      )}
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

interface AssignmentBadgeProps {
  assignment: AssignmentState;
  className?: string;
}

/** Consistent assigned/unassigned pill with a distinct colour + icon. */
export function AssignmentBadge({ assignment, className }: AssignmentBadgeProps) {
  const { label, Icon } = ASSIGNMENT_META[assignment];
  const color = getStatusColor(assignment);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export { STATUS_META, ASSIGNMENT_META };
