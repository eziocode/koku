"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDuration, type DashboardData } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";

import { LazyDetailList } from "../lazy-detail-list";
import { AdminNotificationRow } from "../rows/notification-row";
import { AdminReminderRow } from "../rows/reminder-row";
import type { AuxRows } from "../types";

export function ActivityTab({
  auxRows,
  auxLoading,
  rangeDashboard,
  timeFormat,
}: {
  auxRows: AuxRows;
  auxLoading: boolean;
  rangeDashboard: DashboardData | null;
  timeFormat: TimeFormat;
}) {
  const secondsByProject = useMemo(
    () => new Map((rangeDashboard?.projects ?? []).map((project) => [project.id, project.seconds])),
    [rangeDashboard],
  );

  const projects = useMemo(
    () => auxRows.projects
      .map((row) => {
        const id = String(row.id ?? "");
        const rate = row.hourlyRate === null || row.hourlyRate === undefined || row.hourlyRate === ""
          ? null
          : Number(row.hourlyRate);
        const seconds = secondsByProject.get(id) ?? 0;
        return {
          id,
          name: String(row.name ?? "Untitled project"),
          color: String(row.color ?? "#94a3b8"),
          createdAt: row.createdAt ? String(row.createdAt) : null,
          rate: rate !== null && Number.isFinite(rate) ? rate : null,
          seconds,
          // Only meaningful where a rate is set, so it stays null otherwise
          // rather than reading as zero billable work.
          value: rate !== null && Number.isFinite(rate) ? (seconds / 3600) * rate : null,
        };
      })
      .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name)),
    [auxRows.projects, secondsByProject],
  );

  const categories = rangeDashboard?.categories ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <LazyDetailList
          title="Reminders"
          rows={auxRows.reminders}
          loading={auxLoading}
          hasMore={false}
          loadingMore={false}
          onMore={() => {}}
          emptyLabel="No reminders set."
          render={(row) => <AdminReminderRow row={row} timeFormat={timeFormat} />}
        />
        <LazyDetailList
          title="Notifications received"
          rows={auxRows.notifications}
          loading={auxLoading}
          hasMore={false}
          loadingMore={false}
          onMore={() => {}}
          emptyLabel="No notifications sent to this user."
          render={(row) => <AdminNotificationRow row={row} timeFormat={timeFormat} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <p className="text-xs text-muted-foreground">Time in the selected range.</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-2">
                {categories.length ? categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatDuration(category.seconds)}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No categorized work in range.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <p className="text-xs text-muted-foreground">Rates and tracked value across the selected range.</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              {auxLoading ? (
                <div className="space-y-2 pr-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : projects.length ? (
                <div className="space-y-3 pr-2">
                  {projects.map((project) => (
                    <div key={project.id} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} aria-hidden />
                          <span className="truncate font-medium text-foreground">{project.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{formatDuration(project.seconds)}</span>
                      </div>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {project.rate !== null
                          ? `Rate ${project.rate} per hour · Value ${project.value?.toFixed(2)}`
                          : "No rate set"}
                        {project.createdAt ? ` · Created ${formatDate(project.createdAt, timeFormat)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No projects.</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
