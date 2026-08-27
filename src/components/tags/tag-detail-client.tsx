"use client";

import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatTime } from "@/lib/time-format";
import { formatDuration } from "@/lib/utils";

interface TagDetailClientProps {
  tag: string;
}

export function TagDetailClient({ tag }: TagDetailClientProps) {
  const normalizedTag = tag.trim().toLowerCase();
  const { entries } = useTimeEntries({ tags: [normalizedTag] });
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { value: timeFormat } = useTypedSetting("timeFormat");

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const stats = useMemo(() => {
    const totalSec = entries.reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
    const sortedByDate = [...entries].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const firstSeen = sortedByDate[0]?.startAt ?? null;
    const lastSeen = sortedByDate[sortedByDate.length - 1]?.startAt ?? null;

    const byProject = new Map<string, { name: string; color: string; sec: number }>();
    const byCategory = new Map<string, { name: string; sec: number }>();
    const coTags = new Map<string, number>();

    for (const entry of entries) {
      const sec = entry.durationSec ?? 0;
      if (entry.projectId) {
        const project = projectMap.get(entry.projectId);
        const key = entry.projectId;
        const existing = byProject.get(key) ?? { name: project?.name ?? "Unknown", color: project?.color ?? "#888", sec: 0 };
        existing.sec += sec;
        byProject.set(key, existing);
      }
      if (entry.categoryId) {
        const category = categoryMap.get(entry.categoryId);
        const key = entry.categoryId;
        const existing = byCategory.get(key) ?? { name: category?.name ?? "Unknown", sec: 0 };
        existing.sec += sec;
        byCategory.set(key, existing);
      }
      for (const t of entry.tags) {
        const norm = t.trim().toLowerCase();
        if (norm === normalizedTag) continue;
        coTags.set(norm, (coTags.get(norm) ?? 0) + 1);
      }
    }

    return {
      totalSec,
      firstSeen,
      lastSeen,
      byProject: Array.from(byProject.values()).sort((a, b) => b.sec - a.sec),
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.sec - a.sec),
      coTags: Array.from(coTags.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  }, [entries, projectMap, categoryMap, normalizedTag]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, typeof entries>();
    for (const entry of entries) {
      const day = entry.startAt.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(entry);
      byDay.set(day, list);
    }
    return Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-2 px-0 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/log">
            <ArrowLeft className="h-4 w-4" />
            Back to time log
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Tag</p>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">#{tag}</h1>
        <p className="text-muted-foreground">
          Everything tagged <span className="font-medium text-foreground">#{tag}</span>, across all time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Total time</p></CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{formatDuration(stats.totalSec)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Entries</p></CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{entries.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">First seen</p></CardHeader>
          <CardContent className="pt-0 text-lg font-semibold">
            {stats.firstSeen ? format(new Date(stats.firstSeen), "d MMM yyyy") : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Last seen</p></CardHeader>
          <CardContent className="pt-0 text-lg font-semibold">
            {stats.lastSeen ? format(new Date(stats.lastSeen), "d MMM yyyy") : "—"}
          </CardContent>
        </Card>
      </div>

      {(stats.byProject.length > 0 || stats.byCategory.length > 0 || stats.coTags.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {stats.byProject.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">By project</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.byProject.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <Badge variant="outline" style={{ borderColor: p.color, color: p.color }}>{p.name}</Badge>
                    <span className="font-medium tabular-nums">{formatDuration(p.sec)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {stats.byCategory.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {stats.byCategory.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <Badge variant="secondary">{c.name}</Badge>
                    <span className="font-medium tabular-nums">{formatDuration(c.sec)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {stats.coTags.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Often used with</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {stats.coTags.map(([coTag, count]) => (
                  <Link key={coTag} href={`/tags/${encodeURIComponent(coTag)}`}>
                    <Badge className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground">
                      {coTag} · {count}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="space-y-6">
        {grouped.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            No entries tagged #{tag} yet.
          </div>
        ) : (
          <LazyScrollList
            items={grouped}
            getKey={([day]) => day}
            pageSize={10}
            className="max-h-[48rem]"
            listClassName="space-y-6"
            moreLabel="Load more days"
            empty={<p className="text-sm text-muted-foreground">No entries tagged #{tag} yet.</p>}
            renderItem={([day, dayEntries]) => (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {format(new Date(`${day}T00:00:00`), "EEEE, d MMM yyyy")}
                </p>
                <div className="space-y-3">
                  {dayEntries.map((entry) => {
                    const project = entry.projectId ? projectMap.get(entry.projectId) : null;
                    const category = entry.categoryId ? categoryMap.get(entry.categoryId) : null;
                    return (
                      <div key={entry.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="truncate font-medium text-foreground">{entry.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(entry.startAt, timeFormat)}
                              {entry.endAt ? ` — ${formatTime(entry.endAt, timeFormat)}` : " • Running"}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {project && (
                                <Badge variant="outline" className="text-xs" style={{ borderColor: project.color, color: project.color }}>
                                  {project.name}
                                </Badge>
                              )}
                              {category && <Badge variant="secondary" className="text-xs">{category.name}</Badge>}
                            </div>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-foreground">
                            {formatDuration(entry.durationSec ?? 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
