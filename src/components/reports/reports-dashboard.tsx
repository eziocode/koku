"use client";

import { DailyBarChart } from "@/components/charts/daily-bar-chart";
import { ProjectPieChart } from "@/components/charts/project-pie-chart";
import { TrendLineChart } from "@/components/charts/trend-line-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exportToCSV, exportToJSON, exportToPDF } from "@/lib/export";

interface ReportsDashboardProps {
  month: string;
  totalHours: number;
  projectBreakdown: Array<{ name: string; value: number; hours: number; color: string }>;
  daily: Array<{ label: string; hours: number }>;
}

export function ReportsDashboard({ month, totalHours, projectBreakdown, daily }: ReportsDashboardProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Reports</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Monthly intelligence</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Understand project allocation, daily trends, and exportable summaries for the month.</p>
        </div>
        <form className="flex items-center gap-3">
          <Input type="month" name="month" defaultValue={month} className="w-[180px]" />
          <Button type="submit" variant="outline">View</Button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total hours this month</CardDescription>
            <CardTitle className="text-3xl">{totalHours.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Projects tracked</CardDescription>
            <CardTitle className="text-3xl">{projectBreakdown.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Export</CardDescription>
            <CardTitle className="text-xl">Download your report</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportToCSV(projectBreakdown, `koku-${month}.csv`)}>CSV</Button>
            <Button variant="outline" onClick={() => exportToJSON({ month, totalHours, projectBreakdown, daily }, `koku-${month}.json`)}>JSON</Button>
            <Button variant="outline" onClick={() => exportToPDF(projectBreakdown.map((item) => ({ project: item.name, hours: item.hours, color: item.color })), `koku-${month}.pdf`)}>PDF</Button>
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
            <ProjectPieChart data={projectBreakdown.map((item) => ({ name: item.name, value: item.hours, color: item.color }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Daily totals</CardTitle>
            <CardDescription>How focused hours landed over the month.</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyBarChart data={daily} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trend line</CardTitle>
          <CardDescription>Momentum over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendLineChart data={daily} />
        </CardContent>
      </Card>
    </div>
  );
}
