"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration, type AdminRow, type DashboardData } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";

import { LazyDetailList } from "../lazy-detail-list";
import { AdminEntryRow } from "../rows/entry-row";
import { dayShift } from "../types";

export function TimeTab({
  dashboard,
  rangeDashboard,
  logs,
  logCursor,
  logLoadingMore,
  onMoreLogs,
  dayLoading,
  loading,
  noDataConfirmed,
  selectedDay,
  onSelectDay,
  earliestDataDate,
  today,
  timeFormat,
  projectNames,
  categoryNames,
  taskTitles,
}: {
  dashboard: DashboardData | null;
  rangeDashboard: DashboardData | null;
  logs: AdminRow[];
  logCursor: string | null;
  logLoadingMore: boolean;
  onMoreLogs: () => void;
  dayLoading: boolean;
  loading: boolean;
  noDataConfirmed: boolean;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  earliestDataDate: string | null;
  today: string;
  timeFormat: TimeFormat;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
  taskTitles: Map<string, string>;
}) {
  const olderDayDisabled = earliestDataDate === null || selectedDay <= earliestDataDate;
  const breaks = dashboard?.breakEntries ?? [];
  const tags = rangeDashboard?.tags ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border p-3">
        <Button variant="outline" size="sm" disabled={olderDayDisabled}
          onClick={() => onSelectDay(dayShift(selectedDay, -1))}
          title={olderDayDisabled ? "No older data available" : undefined}>
          Older day
        </Button>
        <Input aria-label="Selected day" type="date" max={today} value={selectedDay}
          onChange={(e) => onSelectDay(e.target.value > today ? today : e.target.value)} className="w-40" />
        <Button variant="outline" size="sm" disabled={selectedDay >= today}
          onClick={() => onSelectDay(dayShift(selectedDay, 1))}>
          Newer day
        </Button>
      </div>

      {!dayLoading && noDataConfirmed && logs.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No data found for <span className="font-semibold text-foreground">{selectedDay}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a different date or use Manual Sync if data was recently added.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Daily work</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2 pr-2">
                {dashboard?.daily.length ? dashboard.daily.map((item) => (
                  <div key={item.day} className="flex justify-between text-sm">
                    <span>{item.day}</span><span className="tabular-nums">{formatDuration(item.seconds)}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No work in range.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Project summary</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2 pr-2">
                {dashboard?.projects.length ? dashboard.projects.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatDuration(item.seconds)}</span>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No projects in range.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <LazyDetailList
          title="Time logs"
          subtitle={selectedDay}
          rows={logs}
          loading={dayLoading}
          hasMore={!!logCursor}
          loadingMore={logLoadingMore}
          onMore={onMoreLogs}
          render={(row) => (
            <AdminEntryRow
              row={row}
              timeFormat={timeFormat}
              projectNames={projectNames}
              categoryNames={categoryNames}
              taskTitles={taskTitles}
            />
          )}
        />

        <LazyDetailList
          title="Breaks"
          subtitle={selectedDay}
          rows={breaks}
          loading={loading}
          hasMore={false}
          loadingMore={false}
          onMore={() => {}}
          emptyLabel="No breaks taken."
          render={(row) => (
            <AdminEntryRow
              row={row}
              timeFormat={timeFormat}
              projectNames={projectNames}
              categoryNames={categoryNames}
              taskTitles={taskTitles}
            />
          )}
        />

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <p className="text-xs text-muted-foreground">Across the selected range.</p>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden px-6 pb-6">
            <ScrollArea className="h-80 max-h-[60vh] rounded-lg xl:h-96">
              <div className="space-y-2 pr-2 pt-1">
                {tags.length ? tags.map((item) => (
                  <div key={item.tag} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/tags/${encodeURIComponent(item.tag)}`}>
                      <Badge variant="secondary" className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground">
                        {item.tag}
                      </Badge>
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatDuration(item.seconds)} · {item.count} log{item.count === 1 ? "" : "s"}
                    </span>
                  </div>
                )) : <p className="py-4 text-center text-sm text-muted-foreground">No tags used in range.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
