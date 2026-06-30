"use client";

import { format, parseISO } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { DailyBarChart } from "@/components/charts/daily-bar-chart";
import { ProjectPieChart } from "@/components/charts/project-pie-chart";
import { TrendLineChart } from "@/components/charts/trend-line-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { exportToCSV, exportToJSON, exportToPDF } from "@/lib/export";

export function ReportsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMonth = searchParams.get("month") || format(new Date(), "yyyy-MM");
  const monthDate = parseISO(`${selectedMonth}-01`);
  const [monthInput, setMonthInput] = useState(selectedMonth);
  const { projects } = useProjects();
  const { entries } = useTimeEntries({
    from: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString(),
    to: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
  });

  useEffect(() => {
    setMonthInput(selectedMonth);
  }, [selectedMonth]);

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const summary = useMemo(() => {
    const projectBreakdownMap = new Map<string, { name: string; value: number; hours: number; color: string }>();
    const dailyMap = new Map<string, number>();
    let totalSeconds = 0;

    for (const entry of entries) {
      totalSeconds += entry.durationSec || 0;
      const project = entry.projectId ? projectMap.get(entry.projectId) : null;
      const key = project?.id || "unassigned";
      const existing = projectBreakdownMap.get(key) || {
        name: project?.name || "Unassigned",
        value: 0,
        hours: 0,
        color: project?.color || "#c0392b",
      };
      existing.value += entry.durationSec || 0;
      existing.hours = Number((existing.value / 3600).toFixed(2));
      projectBreakdownMap.set(key, existing);

      const dayKey = format(new Date(entry.startAt), "MMM d");
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + (entry.durationSec || 0));
    }

    return {
      totalHours: Number((totalSeconds / 3600).toFixed(2)),
      projectBreakdown: Array.from(projectBreakdownMap.values()),
      daily: Array.from(dailyMap.entries()).map(([label, seconds]) => ({
        label,
        hours: Number((seconds / 3600).toFixed(2)),
      })),
    };
  }, [entries, projectMap]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(monthInput ? `/reports?month=${monthInput}` : "/reports");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Reports</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Monthly intelligence</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Understand project allocation, daily trends, and exportable summaries for the month.</p>
        </div>
        <form className="flex items-center gap-3" onSubmit={handleSubmit}>
          <Input type="month" name="month" value={monthInput} onChange={(event) => setMonthInput(event.target.value)} className="w-[180px]" />
          <Button type="submit" variant="outline">View</Button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total hours this month</CardDescription>
            <CardTitle className="text-3xl">{summary.totalHours.toFixed(2)}</CardTitle>
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
            <CardTitle className="text-xl">Download your report</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportToCSV(summary.projectBreakdown, `koku-${selectedMonth}.csv`)}>CSV</Button>
            <Button variant="outline" onClick={() => exportToJSON({ month: selectedMonth, totalHours: summary.totalHours, projectBreakdown: summary.projectBreakdown, daily: summary.daily }, `koku-${selectedMonth}.json`)}>JSON</Button>
            <Button variant="outline" onClick={() => exportToPDF(summary.projectBreakdown.map((item) => ({ project: item.name, hours: item.hours, color: item.color })), `koku-${selectedMonth}.pdf`)}>PDF</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Project breakdown</CardTitle>
            <CardDescription>Where your hours accumulated this month.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectPieChart data={summary.projectBreakdown.map((item) => ({ name: item.name, value: item.hours, color: item.color }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily totals</CardTitle>
            <CardDescription>How focused hours landed over the month.</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyBarChart data={summary.daily} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trend line</CardTitle>
          <CardDescription>Momentum over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendLineChart data={summary.daily} />
        </CardContent>
      </Card>
    </div>
  );
}
