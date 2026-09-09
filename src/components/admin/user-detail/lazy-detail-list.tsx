"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminRow } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export function LazyDetailList({
  title,
  subtitle,
  rows,
  loading,
  hasMore,
  loadingMore,
  onMore,
  render,
  emptyLabel = "No records.",
  heightClassName = "h-80 max-h-[60vh] xl:h-96",
}: {
  title: string;
  subtitle?: string;
  rows: AdminRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  render: (row: AdminRow) => React.ReactNode;
  emptyLabel?: string;
  heightClassName?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) onMore();
      },
      { threshold: 0.1 },
    );
    const el = sentinelRef.current;
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [hasMore, loadingMore, onMore]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-6 pb-6">
        <ScrollArea className={cn("rounded-lg", heightClassName)}>
          <div className="space-y-3 pr-2 pt-1">
            {loading ? (
              [1, 2, 3].map((item) => <Skeleton key={item} className="h-16 rounded-lg" />)
            ) : rows.length ? (
              rows.map((row, index) => (
                <div key={String(row.id ?? index)} className="min-w-0 rounded-lg border p-3 text-sm text-muted-foreground">
                  {render(row)}
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
            )}
            {hasMore && (
              <div ref={sentinelRef} className="py-2 text-center">
                {loadingMore ? (
                  <span className="text-xs text-muted-foreground">Loading more…</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={onMore} className="text-xs">Load more</Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
