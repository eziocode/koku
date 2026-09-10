"use client";

import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { NoteMetadata } from "@/lib/storage/note-metadata";

const subscribe = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const columnsSnapshot = () => window.innerWidth >= 1280 ? 3 : window.innerWidth >= 768 ? 2 : 1;
type Row = { key: string; day: string; notes?: NoteMetadata[] };

export function VirtualNotes({ groups, view, dateLabel, renderNote }: {
  groups: [string, NoteMetadata[]][];
  view: "grid" | "list";
  dateLabel: string;
  renderNote: (note: NoteMetadata) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const responsiveColumns = useSyncExternalStore(subscribe, columnsSnapshot, () => 1);
  const columns = view === "list" ? 1 : responsiveColumns;
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const [day, notes] of groups) {
      result.push({ key: day, day });
      for (let i = 0; i < notes.length; i += columns) {
        result.push({ key: notes[i].id, day, notes: notes.slice(i, i + columns) });
      }
    }
    return result;
  }, [columns, groups]);
  const focusedIndex = focusedKey === null ? -1 : rows.findIndex((row) => row.key === focusedKey);
  // Keep the focused row and its neighbours mounted. Tab can cross a window
  // boundary without losing focus or jumping to controls outside the list.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => rows[index].notes ? view === "grid" ? 210 : 64 : 44,
    getItemKey: (index) => rows[index].key,
    overscan: 4,
    rangeExtractor: (range) => [...new Set([...defaultRangeExtractor(range), ...[focusedIndex - 1, focusedIndex, focusedIndex + 1].filter((index) => focusedIndex >= 0 && index >= 0 && index < rows.length)])].sort((a, b) => a - b),
  });

  if (!rows.length) return <p className="text-sm text-muted-foreground">No notes found.</p>;
  return (
    <div ref={parentRef} className="h-[44rem] overflow-y-auto overflow-x-hidden" aria-label="Notes" role="region"
      onFocusCapture={(event) => setFocusedKey((event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey ?? null)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedKey(null); }}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return <div key={item.key} data-index={item.index} data-row-key={row.key} ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full pb-3 pr-2" style={{ transform: `translateY(${item.start}px)` }}>
            {row.notes ? <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {row.notes.map(renderNote)}
            </div> : <h2 className="py-2 text-sm font-semibold text-muted-foreground">{dateLabel}{new Date(`${row.day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}</h2>}
          </div>;
        })}
      </div>
    </div>
  );
}
