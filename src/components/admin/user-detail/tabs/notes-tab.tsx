"use client";

import { useMemo } from "react";

import type { AdminRow } from "@/lib/admin-data";
import type { TimeFormat } from "@/lib/settings/schema";

import { LazyDetailList } from "../lazy-detail-list";
import { AdminNoteRow } from "../rows/note-row";

export function NotesTab({
  notes,
  noteCursor,
  noteLoadingMore,
  onMoreNotes,
  dayLoading,
  noteLinks,
  selectedDay,
  timeFormat,
}: {
  notes: AdminRow[];
  noteCursor: string | null;
  noteLoadingMore: boolean;
  onMoreNotes: () => void;
  dayLoading: boolean;
  noteLinks: AdminRow[];
  selectedDay: string;
  timeFormat: TimeFormat;
}) {
  /** Links are undirected for this count: a note either end of one is linked. */
  const linkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of noteLinks) {
      for (const key of [link.sourceNoteId, link.targetNoteId]) {
        const id = key ? String(key) : null;
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [noteLinks]);

  return (
    <LazyDetailList
      title="Notes"
      subtitle={selectedDay}
      rows={notes}
      loading={dayLoading}
      hasMore={!!noteCursor}
      loadingMore={noteLoadingMore}
      onMore={onMoreNotes}
      heightClassName="h-[32rem] max-h-[70vh]"
      render={(row) => (
        <AdminNoteRow
          row={row}
          timeFormat={timeFormat}
          linkCount={linkCounts.get(String(row.id)) ?? 0}
        />
      )}
    />
  );
}
