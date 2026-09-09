"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/ui/markdown-text";
import { formatDuration, type AdminRow } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime } from "@/lib/time-format";

/**
 * One time log in the admin Time tab.
 *
 * Shows the whole span rather than just the start: "9:40 to 11:05" answers
 * when someone was at their desk in a way a start plus a duration does not,
 * and an entry with no end is a timer still running right now.
 */
export function AdminEntryRow({
  row,
  timeFormat,
  projectNames,
  categoryNames,
  taskTitles,
}: {
  row: AdminRow;
  timeFormat: TimeFormat;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
  taskTitles: Map<string, string>;
}) {
  const tags = Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : [];
  const projectName = row.projectId ? projectNames.get(String(row.projectId)) : undefined;
  const categoryName = row.categoryId ? categoryNames.get(String(row.categoryId)) : undefined;
  const taskTitle = row.taskId ? taskTitles.get(String(row.taskId)) : undefined;
  const startAt = row.startAt ? String(row.startAt) : null;
  const endAt = row.endAt ? String(row.endAt) : null;
  const running = Boolean(startAt) && !endAt;

  const span = startAt
    ? `${new Date(startAt).toLocaleDateString()}, ${formatTime(startAt, timeFormat)}${endAt ? ` to ${formatTime(endAt, timeFormat)}` : ""}`
    : "No start time";

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words font-medium text-foreground">
          {String(row.title || "Untitled work")}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDuration(row.durationSec)}
        </p>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">{span}</p>
      {(projectName || categoryName || taskTitle || running || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {running ? <Badge variant="default">Running now</Badge> : null}
          {projectName ? <Badge variant="outline">{projectName}</Badge> : null}
          {categoryName ? <Badge variant="secondary">{categoryName}</Badge> : null}
          {taskTitle ? <Badge variant="outline">Task: {taskTitle}</Badge> : null}
          {tags.map((tag) => (
            <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
              <Badge variant="secondary" className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground">
                {tag}
              </Badge>
            </Link>
          ))}
        </div>
      )}
      {row.notes ? (
        <MarkdownText text={String(row.notes)} className="text-muted-foreground" />
      ) : null}
    </div>
  );
}
