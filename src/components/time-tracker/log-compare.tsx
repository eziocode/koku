"use client";

import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { useMemo } from "react";

import { ProjectPieChart } from "@/components/charts/project-pie-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatTime } from "@/lib/time-format";
import { formatDuration } from "@/lib/utils";

interface ComparePanelProps { date: string; label: "A" | "B"; }

function ComparePanel({ date, label }: ComparePanelProps) {
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const parsedDate = useMemo(() => parseISO(date + "T00:00:00"), [date]);
  const { entries } = useTimeEntries({ from: startOfDay(parsedDate).toISOString(), to: endOfDay(parsedDate).toISOString() });
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const totalSec = useMemo(() => entries.reduce((sum, e) => sum + (e.durationSec ?? 0), 0), [entries]);
  const pieData = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const project = entry.projectId ? projectMap.get(entry.projectId) : null;
      const key = project?.id ?? "unassigned";
      const existing = map.get(key) ?? { name: project?.name ?? "Unassigned", value: 0, color: project?.color ?? "#c0392b" };
      existing.value = Number(((existing.value * 3600 + (entry.durationSec ?? 0)) / 3600).toFixed(2));
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [entries, projectMap]);
  const joinedEntries = useMemo(() => entries.map((e) => ({ ...e, project: e.projectId ? projectMap.get(e.projectId) ?? null : null, category: e.categoryId ? categoryMap.get(e.categoryId) ?? null : null })), [entries, projectMap, categoryMap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Total time</p><p className="text-2xl font-semibold">{formatDuration(totalSec)}</p></CardHeader></Card>
        <Card><CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Entries</p><p className="text-2xl font-semibold">{entries.length}</p></CardHeader></Card>
      </div>
      {pieData.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">By project</CardTitle></CardHeader><CardContent><ProjectPieChart data={pieData} /></CardContent></Card>
      )}
      <LazyScrollList
        items={joinedEntries}
        getKey={(entry) => entry.id}
        pageSize={8}
        className="h-[32rem]"
        listClassName="space-y-2"
        moreLabel="Load more entries"
        empty={<div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">No entries for this day.</div>}
        renderItem={(entry) => (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium text-foreground">{entry.title}</p>
                <p className="text-xs text-muted-foreground">{formatTime(new Date(entry.startAt), timeFormat)}{entry.endAt ? " – " + formatTime(new Date(entry.endAt), timeFormat) : " • Running"}</p>
                <div className="flex flex-wrap gap-1">
                  {entry.project && <Badge variant="outline" className="text-xs" style={{ borderColor: entry.project.color, color: entry.project.color }}>{entry.project.name}</Badge>}
                  {entry.category && <Badge variant="secondary" className="text-xs">{entry.category.name}</Badge>}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-foreground">{formatDuration(entry.durationSec ?? 0)}</span>
            </div>
          </div>
        )}
      />
      <p className="text-center text-xs text-muted-foreground">Side {label} — {format(parsedDate, "d MMM yyyy")}</p>
    </div>
  );
}

interface LogCompareProps { dateA: string; dateB: string; onChangeDateA: (date: string) => void; onChangeDateB: (date: string) => void; }

export function LogCompare({ dateA, dateB, onChangeDateA, onChangeDateB }: LogCompareProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-3">
          <Label className="shrink-0 font-semibold text-primary">Side A</Label>
          <DatePicker value={dateA} onChange={onChangeDateA} className="w-[180px]" />
        </div>
        <div className="flex items-center gap-3">
          <Label className="shrink-0 font-semibold text-primary">Side B</Label>
          <DatePicker value={dateB} onChange={onChangeDateB} className="w-[180px]" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ComparePanel date={dateA} label="A" />
        <ComparePanel date={dateB} label="B" />
      </div>
    </div>
  );
}
