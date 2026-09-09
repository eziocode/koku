"use client";

import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/ui/markdown-text";
import { adminTaskAccruedSec, formatDate, formatDuration, type AdminRow } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";

export const TASK_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  paused: "Paused",
  done: "Done",
};
export const TASK_PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export const TASK_STATUS_ORDER = ["open", "in_progress", "paused", "done"] as const;

/** One task in the admin Tasks panel. */
export function AdminTaskRow({
  row,
  timeFormat,
  today,
  projectNames,
  categoryNames,
}: {
  row: AdminRow;
  timeFormat: TimeFormat;
  today: string;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
}) {
  const status = String(row.status ?? "open");
  const priority = String(row.priority ?? "medium");
  const dueAt = row.dueAt ? String(row.dueAt) : null;
  const overdue = status !== "done" && dueAt !== null && dueAt.slice(0, 10) < today;
  const tags = Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : [];
  const projectName = row.projectId ? projectNames.get(String(row.projectId)) : undefined;
  const categoryName = row.categoryId ? categoryNames.get(String(row.categoryId)) : undefined;
  const accrued = adminTaskAccruedSec(row);
  const runningSince = row.inProgressSince ? String(row.inProgressSince) : null;

  const timeline: Array<[string, string]> = [];
  if (row.startAt) timeline.push(["Started", formatDate(row.startAt, timeFormat)]);
  if (row.completedAt) timeline.push(["Completed", formatDate(row.completedAt, timeFormat)]);
  if (row.reopenedAt) timeline.push(["Reopened", formatDate(row.reopenedAt, timeFormat)]);

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium text-foreground">
          {String(row.title || "Untitled task")}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDate(row.updatedAt ?? row.createdAt, timeFormat)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{TASK_STATUS_LABEL[status] ?? status}</Badge>
        <Badge variant="outline">{TASK_PRIORITY_LABEL[priority] ?? priority} priority</Badge>
        {projectName ? <Badge variant="outline">{projectName}</Badge> : null}
        {categoryName ? <Badge variant="secondary">{categoryName}</Badge> : null}
        {dueAt ? (
          <Badge variant={overdue ? "destructive" : "outline"}>
            {overdue ? "Overdue" : "Due"} {formatDate(dueAt, timeFormat)}
          </Badge>
        ) : null}
        {tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
      </div>
      {(accrued > 0 || runningSince) && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {accrued > 0 ? `Accrued ${formatDuration(accrued)}` : "Not started"}
          {runningSince ? ` · Running since ${formatDate(runningSince, timeFormat)}` : ""}
        </p>
      )}
      {timeline.length > 0 && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {timeline.map(([label, value]) => `${label} ${value}`).join(" · ")}
        </p>
      )}
      {row.notes ? (
        <MarkdownText text={String(row.notes)} className="text-sm text-muted-foreground" />
      ) : null}
    </div>
  );
}
