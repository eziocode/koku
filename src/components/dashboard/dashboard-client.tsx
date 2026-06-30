"use client";

import { eachDayOfInterval, endOfDay, endOfWeek, format, startOfDay, startOfWeek } from "date-fns";
import { useMemo } from "react";

import { DailyBarChart } from "@/components/charts/daily-bar-chart";
import { Timer } from "@/components/time-tracker/timer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { formatDuration } from "@/lib/utils";

export function DashboardClient() {
  const { projects } = useProjects();
  const { categories } = useCategories();
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(today);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const { entries: todayEntries } = useTimeEntries({
    from: today.toISOString(),
    to: todayEnd.toISOString(),
  });
  const { entries: weekEntries } = useTimeEntries({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  });
  const { entries: allEntries } = useTimeEntries();

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const totalTodaySeconds = todayEntries.reduce(
    (sum, entry) => sum + (entry.durationSec || 0),
    0,
  );
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const chartData = weekDays.map((day) => {
    const label = format(day, "EEE");
    const totalSeconds = weekEntries
      .filter((entry) => format(new Date(entry.startAt), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
      .reduce((sum, entry) => sum + (entry.durationSec || 0), 0);

    return {
      label,
      hours: Number((totalSeconds / 3600).toFixed(2)),
    };
  });

  const recentEntries = useMemo(
    () => allEntries.slice(0, 5).map((entry) => ({
      ...entry,
      project: entry.projectId ? projectMap.get(entry.projectId) || null : null,
      category: entry.categoryId ? categoryMap.get(entry.categoryId) || null : null,
    })),
    [allEntries, categoryMap, projectMap],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your work pulse</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Track momentum today, notice trends this week, and capture your next focused block.
          </p>
        </div>
        <Badge variant="secondary">Local-first</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Today’s total</CardDescription>
            <CardTitle className="text-3xl">{formatDuration(totalTodaySeconds)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Entries today</CardDescription>
            <CardTitle className="text-3xl">{todayEntries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Quick action</CardDescription>
            <CardTitle className="text-xl">Start a timer below</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Timer />
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <CardDescription>Daily focused hours</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyBarChart data={chartData} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent time entries</CardTitle>
          <CardDescription>Your latest captured sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentEntries.length ? (
            recentEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.project?.name || "Unassigned"}
                    {entry.category ? ` • ${entry.category.name}` : ""}
                  </p>
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {formatDuration(entry.durationSec || 0)}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent entries yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
