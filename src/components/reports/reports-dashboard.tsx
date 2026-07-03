"use client";

import { format, isValid, parseISO } from "date-fns";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { ChartLoading } from "@/components/charts/chart-states";
import { ASSIGNMENT_META, STATUS_META } from "@/components/charts/status-badge";
import { DEFAULT_FILTERS, LogFilterState, LogFilters } from "@/components/time-tracker/log-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  buildSegmentedDays,
  toProjectBreakdown,
  toStatusBreakdown,
  type WorkLogSegment,
} from "@/lib/charts/segments";
import { getStatusColor } from "@/lib/charts/theme";
import { exportToCSV, exportToJSON, exportToPDF, exportToXLSX } from "@/lib/export";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { formatDuration } from "@/lib/utils";

const chartLoader = () => <ChartLoading />;

const SegmentedBarChart = dynamic(
  () => import("@/components/charts/segmented-bar-chart").then((mod) => mod.SegmentedBarChart),
  { loading: chartLoader },
);
const ProjectPieChart = dynamic(
  () => import("@/components/charts/project-pie-chart").then((mod) => mod.ProjectPieChart),
  { loading: chartLoader },
);
const TrendLineChart = dynamic(
  () => import("@/components/charts/trend-line-chart").then((mod) => mod.TrendLineChart),
  { loading: chartLoader },
);

export function ReportsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");
  const monthDate = useMemo(() => {
    const parsed = monthParam ? parseISO(`${monthParam}-01`) : null;
    return parsed && isValid(parsed) ? parsed : new Date();
  }, [monthParam]);
  const selectedMonth = format(monthDate, "yyyy-MM");
  const monthStart = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
    [monthDate],
  );
  const monthEnd = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999),
    [monthDate],
  );
  const { projects } = useProjects();
  const { categories } = useCategories();

  const [filters, setFilters] = useState<LogFilterState>(DEFAULT_FILTERS);

  // The visible chart interval always follows the selected month, but an explicit
  // date-range filter narrows the query window by intersecting with the month.
  const range = useMemo(() => {
    const monthFrom = monthStart.getTime();
    const monthTo = monthEnd.getTime();

    const filterFrom = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : NaN;
    const filterTo = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : NaN;

    const fromMs = Number.isNaN(filterFrom) ? monthFrom : Math.max(monthFrom, filterFrom);
    const toMs = Number.isNaN(filterTo) ? monthTo : Math.min(monthTo, filterTo);

    // Guard against an inverted window (e.g. range wholly outside the month).
    if (fromMs > toMs) {
      return { from: monthStart.toISOString(), to: monthStart.toISOString() };
    }
    return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
  }, [monthStart, monthEnd, filters.from, filters.to]);

  const { entries } = useTimeEntries({
    from: range.from,
    to: range.to,
    projectIds: filters.projectIds.length ? filters.projectIds : undefined,
    categoryIds: filters.categoryIds.length ? filters.categoryIds : undefined,
    tags: filters.tags.length ? filters.tags : undefined,
    minDurationSec: filters.minH > 0 ? filters.minH * 3600 : undefined,
    maxDurationSec: filters.maxH > 0 ? filters.maxH * 3600 : undefined,
    search: filters.q || undefined,
  });

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const segmentedDays = useMemo(
    () =>
      buildSegmentedDays({
        entries,
        projectMap,
        categoryMap,
        interval: { start: monthStart, end: monthEnd },
        labelFormat: "date",
      }),
    [entries, projectMap, categoryMap, monthStart, monthEnd],
  );

  const projectBreakdown = useMemo(() => toProjectBreakdown(segmentedDays), [segmentedDays]);
  const statusBreakdown = useMemo(
    () => toStatusBreakdown(segmentedDays, getStatusColor),
    [segmentedDays],
  );

  const summary = useMemo(() => {
    const totalSeconds = segmentedDays.reduce((sum, day) => sum + day.totalSeconds, 0);
    const totalLogs = segmentedDays.reduce((sum, day) => sum + day.segments.length, 0);
    return {
      totalHours: Number((totalSeconds / 3600).toFixed(2)),
      totalSeconds,
      totalLogs,
      projectBreakdown: projectBreakdown.map((item) => ({
        name: item.name,
        value: item.hours,
        hours: item.hours,
        color: item.color,
        seconds: item.seconds,
      })),
      daily: segmentedDays.map((day) => ({ label: day.label, hours: day.totalHours })),
    };
  }, [segmentedDays, projectBreakdown]);

  const legendItems = useMemo(
    () =>
      projectBreakdown.slice(0, 8).map((item) => ({
        key: item.key,
        label: item.name,
        color: item.color,
        value: formatDuration(item.seconds),
      })),
    [projectBreakdown],
  );

  // A single pie combining status + assignment, so progress and ownership read
  // together. Slices reuse the shared status palette for consistency.
  const statusPie = useMemo(
    () => [...statusBreakdown.status, ...statusBreakdown.assignment],
    [statusBreakdown],
  );

  const statusLegend = useMemo(
    () => [
      ...statusBreakdown.status.map((slice) => ({
        key: slice.key,
        label: slice.name,
        color: slice.color,
        value: `${slice.count}`,
        Icon: STATUS_META[slice.key as keyof typeof STATUS_META]?.Icon,
        live: slice.key === "running",
      })),
      ...statusBreakdown.assignment.map((slice) => ({
        key: slice.key,
        label: slice.name,
        color: slice.color,
        value: `${slice.count}`,
        Icon: ASSIGNMENT_META[slice.key as keyof typeof ASSIGNMENT_META]?.Icon,
      })),
    ],
    [statusBreakdown],
  );

  const handleSegmentClick = useCallback(
    (segment: WorkLogSegment) => {
      const day = segment.startAt ? format(new Date(segment.startAt), "yyyy-MM-dd") : "";
      router.push(day ? `/log?date=${day}` : "/log");
    },
    [router],
  );

  const xlsxEntries = useMemo(
    () =>
      entries.map((entry) => ({
        title: entry.title,
        startAt: entry.startAt,
        endAt: entry.endAt ?? null,
        durationSec: entry.durationSec ?? null,
        projectName: entry.projectId ? projectMap.get(entry.projectId)?.name ?? "Unassigned" : "Unassigned",
        categoryName: entry.categoryId ? categoryMap.get(entry.categoryId)?.name ?? null : null,
        tags: entry.tags,
        notes: entry.notes ?? null,
        createdAt: entry.createdAt,
      })),
    [categoryMap, entries, projectMap],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Reports</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Monthly intelligence</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Understand project allocation, daily trends, and exportable summaries for the month.</p>
        </div>
        <MonthPicker
          value={selectedMonth}
          onChange={(m) => router.push(m ? `/reports?month=${m}` : "/reports")}
          className="w-[180px]"
        />
      </div>

      <LogFilters filters={filters} onChange={setFilters} />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total hours this month</CardDescription>
            <CardTitle className="text-3xl">{summary.totalHours.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Logs recorded</CardDescription>
            <CardTitle className="text-3xl">{summary.totalLogs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Projects tracked</CardDescription>
            <CardTitle className="text-3xl">{summary.projectBreakdown.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Export</CardDescription>
            <CardTitle className="text-lg">Download report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={() => void exportToXLSX(xlsxEntries, `koku-${selectedMonth}-report.xlsx`)}
            >
              Full report (.xlsx)
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void exportToCSV(summary.projectBreakdown, `koku-${selectedMonth}.csv`)}>CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportToJSON({ month: selectedMonth, totalHours: summary.totalHours, projectBreakdown: summary.projectBreakdown, daily: summary.daily }, `koku-${selectedMonth}.json`)}>JSON</Button>
              <Button variant="outline" size="sm" onClick={() => void exportToPDF(summary.projectBreakdown.map((item) => ({ project: item.name, hours: item.hours, color: item.color })), `koku-${selectedMonth}.pdf`)}>PDF</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ChartCard
        title="Daily activity"
        description="Each block is a single work log, stacked by day. Running logs shimmer live; unassigned logs are outlined. Hover for details, click to open that day."
        footer={legendItems.length ? <ChartLegend items={legendItems} /> : undefined}
      >
        <SegmentedBarChart
          days={segmentedDays}
          height={320}
          onSegmentClick={handleSegmentClick}
          emptyTitle="No activity this month"
          emptyDescription="Adjust filters or log time to populate this view."
        />
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard
          title="Project breakdown"
          description="Where your hours accumulated this month."
          footer={legendItems.length ? <ChartLegend items={legendItems} /> : undefined}
        >
          <ProjectPieChart
            height={300}
            centerLabel="tracked"
            centerValue={`${summary.totalHours.toFixed(1)}h`}
            data={summary.projectBreakdown.map((item) => ({
              name: item.name,
              value: item.hours,
              color: item.color,
              seconds: item.seconds,
            }))}
          />
        </ChartCard>
        <ChartCard
          title="Status & progress"
          description="Distribution of log status and assignment across the month."
          footer={statusLegend.length ? <ChartLegend items={statusLegend} /> : undefined}
        >
          <ProjectPieChart
            height={300}
            centerLabel="logs"
            centerValue={`${summary.totalLogs}`}
            data={statusPie.map((slice) => ({
              name: slice.name,
              value: slice.count,
              color: slice.color,
              seconds: slice.seconds,
              count: slice.count,
            }))}
          />
        </ChartCard>
        <ChartCard title="Momentum" description="How focused hours trended over the month.">
          <TrendLineChart data={summary.daily} height={300} />
        </ChartCard>
      </div>
    </div>
  );
}
