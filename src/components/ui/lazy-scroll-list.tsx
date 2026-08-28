"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type LazyScrollListProps<T> = {
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  empty: ReactNode;
  pageSize?: number;
  className?: string;
  listClassName?: string;
  moreLabel?: string;
  /** Escape hatch for callers whose keys don't reflect a real content change; defaults to items' own keys. */
  resetKey?: string;
};

/** Incrementally renders large local collections inside a bounded scroll view. */
export function LazyScrollList<T>({
  items,
  getKey,
  renderItem,
  empty,
  pageSize = 12,
  className,
  listClassName,
  moreLabel = "Load more",
  resetKey,
}: LazyScrollListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = visibleCount < items.length;
  const needsScrollArea = items.length > pageSize;
  const itemsKey = resetKey ?? items.map((item, index) => getKey(item, index)).join("|");

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [itemsKey, pageSize]);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((count) => Math.min(count + pageSize, items.length));
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, items.length, pageSize]);

  const content = (
    <div className={cn("space-y-3", needsScrollArea && "pr-3", listClassName)}>
      {items.length ? items.slice(0, visibleCount).map((item, index) => (
        <div key={getKey(item, index)}>{renderItem(item, index)}</div>
      )) : empty}
      {hasMore && (
        <div ref={sentinelRef} className="py-2 text-center">
          <Button variant="ghost" size="sm" onClick={() => setVisibleCount((count) => Math.min(count + pageSize, items.length))}>
            {moreLabel}
          </Button>
        </div>
      )}
    </div>
  );

  return needsScrollArea ? <ScrollArea className={cn("h-96", className)}>{content}</ScrollArea> : content;
}
