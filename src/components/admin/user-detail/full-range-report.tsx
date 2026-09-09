"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration, tiptapToPlainText, type AdminRow } from "@/lib/admin-data";
import { exportToCSV, exportToXLSX } from "@/lib/export";
import type { TimeFormat } from "@/lib/settings/schema";
import { formatTime } from "@/lib/time-format";

/**
 * Flattens the report rows for export.
 *
 * `projectNames` resolves the stored project id to its name: the raw id is
 * meaningless in a spreadsheet handed to anyone, and the report is the one
 * place this data leaves the app.
 */
export async function exportAdminReport(
  rows: AdminRow[],
  format: "csv" | "xlsx",
  timeFormat: TimeFormat = "24h",
  projectNames: Map<string, string> = new Map(),
) {
  const clean = rows.map((row) => ({
    Date: new Date(String(row.startAt ?? row.updatedAt ?? row.createdAt)).toLocaleDateString(),
    Time: formatTime(new Date(String(row.startAt ?? row.updatedAt ?? row.createdAt)), timeFormat),
    Type: row.table === "notes" ? "Note" : "Time log",
    Title: String(row.title ?? (row.table === "notes" ? "Untitled note" : "Untitled work")),
    Project: row.projectId ? projectNames.get(String(row.projectId)) ?? String(row.projectId) : "Unassigned",
    Duration: row.table === "notes" ? "" : formatDuration(row.durationSec),
    Tags: Array.isArray(row.tags) ? row.tags.map(String).join(", ") : "",
    Content: row.table === "notes" ? tiptapToPlainText(row.content).trim() : String(row.notes ?? ""),
  }));
  if (format === "csv") await exportToCSV(clean, "koku-admin-report.csv");
  else await exportToXLSX(clean.map((row) => ({ title: row.Title, startAt: `${row.Date} ${row.Time}`, endAt: null, durationSec: null, projectName: row.Project, categoryName: row.Type, tags: row.Tags ? row.Tags.split(", ") : [], notes: row.Content, createdAt: `${row.Date} ${row.Time}` })), "koku-admin-report.xlsx", timeFormat);
}

export function FullRangeReport({
  days,
  rows,
  loading,
  hasMore,
  loadingMore,
  onMore,
  onExportCSV,
  onExportXLSX,
}: {
  days: string[];
  rows: AdminRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const byDay = new Map<string, AdminRow[]>();
  rows.forEach((row) => {
    const value = row.startAt ?? row.updatedAt ?? row.createdAt;
    const day = value ? String(value).slice(0, 10) : "unknown";
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  });
  useEffect(() => {
    if (!hasMore || !sentinelRef.current || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onMore();
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onMore]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Full report by date</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportCSV}>CSV</Button>
          <Button variant="outline" size="sm" onClick={onExportXLSX}>XLSX</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-20 rounded-lg" /> : (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-2">
            {(() => {
              const missing = days.filter((day) => !byDay.has(day));
              return missing.length ? <section className="rounded-lg border border-dashed p-3"><h3 className="text-sm font-semibold">No records on {missing.length} date{missing.length === 1 ? "" : "s"}</h3><p className="mt-1 text-xs text-muted-foreground">{missing.join(", ")}</p></section> : null;
            })()}
            {days.filter((day) => byDay.has(day)).map((day) => {
              const dayRows = byDay.get(day) ?? [];
              return (
                <section key={day} className="space-y-2">
                  <h3 className="border-b pb-1 text-sm font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}</h3>
                  {dayRows.length ? dayRows.map((row, index) => (
                    <div key={String(row.id ?? `${day}-${index}`)} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{String(row.title ?? (row.table === "notes" ? "Untitled note" : "Untitled work"))}</p>
                      {row.table === "notes" ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{tiptapToPlainText(row.content).trim() || "No text"}</p> : <p className="mt-1 text-xs text-muted-foreground">{formatDuration(row.durationSec)}</p>}
                    </div>
                  )) : null}
                </section>
              );
            })}
            {hasMore && <div ref={sentinelRef} className="py-2 text-center"><Button variant="outline" size="sm" onClick={onMore} disabled={loadingMore}>{loadingMore ? "Loading more…" : "Load more"}</Button></div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
