"use client";

import { useMemo } from "react";

import { adminTaskAccruedSec, formatDuration, type AdminRow } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";

import { LazyDetailList } from "../lazy-detail-list";
import { AdminTaskRow, TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "../rows/task-row";
import { StatTile } from "../stat-tile";

export function TasksTab({
  tasks,
  taskCursor,
  taskLoadingMore,
  onMoreTasks,
  loading,
  rangeStart,
  rangeEnd,
  today,
  timeFormat,
  projectNames,
  categoryNames,
}: {
  tasks: AdminRow[];
  taskCursor: string | null;
  taskLoadingMore: boolean;
  onMoreTasks: () => void;
  loading: boolean;
  rangeStart: string;
  rangeEnd: string;
  today: string;
  timeFormat: TimeFormat;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
}) {
  // Counted over the loaded page rather than the whole table, so the strip
  // always describes exactly the rows below it.
  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();
    let accrued = 0;
    let overdue = 0;
    for (const row of tasks) {
      const status = String(row.status ?? "open");
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      accrued += adminTaskAccruedSec(row);
      const dueAt = row.dueAt ? String(row.dueAt) : null;
      if (status !== "done" && dueAt && dueAt.slice(0, 10) < today) overdue += 1;
    }
    return { byStatus, accrued, overdue };
  }, [tasks, today]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {TASK_STATUS_ORDER.map((status) => (
          <StatTile key={status} label={TASK_STATUS_LABEL[status]} value={counts.byStatus.get(status) ?? 0} />
        ))}
        <StatTile label="Overdue" value={counts.overdue} />
        <StatTile label="Task time" value={formatDuration(counts.accrued)} hint="Task stopwatches" />
      </div>

      <LazyDetailList
        title="Tasks"
        subtitle={`Created between ${rangeStart} and ${rangeEnd}`}
        rows={tasks}
        loading={loading}
        hasMore={!!taskCursor}
        loadingMore={taskLoadingMore}
        onMore={onMoreTasks}
        heightClassName="h-[32rem] max-h-[70vh]"
        render={(row) => (
          <AdminTaskRow
            row={row}
            timeFormat={timeFormat}
            today={today}
            projectNames={projectNames}
            categoryNames={categoryNames}
          />
        )}
      />
    </div>
  );
}
