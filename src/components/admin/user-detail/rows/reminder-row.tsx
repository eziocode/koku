"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate, type AdminRow } from "@/lib/admin-data";
import { WEEKDAY_LABELS } from "@/lib/predictions/work-window";
import type { TimeFormat } from "@/lib/settings/schema";

const REPEAT_LABEL: Record<string, string> = {
  none: "One off",
  daily: "Daily",
  weekly: "Weekly",
  custom: "Custom days",
};

/** One scheduled reminder in the admin Activity tab. */
export function AdminReminderRow({ row, timeFormat }: { row: AdminRow; timeFormat: TimeFormat }) {
  const repeat = String(row.repeat ?? "none");
  const active = row.active === true || row.active === "true";
  const customDays = Array.isArray(row.customDays)
    ? row.customDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium text-foreground">
          {String(row.message || "Untitled reminder")}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDate(row.triggerAt, timeFormat)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Paused"}</Badge>
        <Badge variant="secondary">{REPEAT_LABEL[repeat] ?? repeat}</Badge>
        {repeat === "custom" && customDays.length > 0 ? (
          <Badge variant="outline">{customDays.map((day) => WEEKDAY_LABELS[day].slice(0, 3)).join(", ")}</Badge>
        ) : null}
      </div>
    </div>
  );
}
