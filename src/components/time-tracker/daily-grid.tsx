"use client";

import { Pencil, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EntryForm } from "@/components/time-tracker/entry-form";
import { EntryNotes } from "@/components/time-tracker/entry-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { toast } from "@/components/ui/toast";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";
import { RunEventLog } from "@/components/time-tracker/run-event-log";
import { useCloneToTimer } from "@/components/time-tracker/use-clone-to-timer";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatDuration } from "@/lib/utils";

interface EntryRecord {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  durationSec: number | null;
  segments?: { startAt: string; endAt: string }[] | null;
  tags: string[];
  notes: string | null;
  taskId?: string | null;
  project: { id: string; name: string; color: string } | null;
  category: { id: string; name: string; color: string } | null;
}

interface DailyGridProps {
  entries: EntryRecord[];
}

export function DailyGrid({ entries }: DailyGridProps) {
  const { deleteEntry } = useTimeEntries();
  const { value: timeFormat } = useTypedSetting("timeFormat");
  const [editingId, setEditingId] = useState<string | null>(null);
  const cloneToTimer = useCloneToTimer();

  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) || null,
    [editingId, entries],
  );

  async function handleDelete(id: string) {
    try {
      await deleteEntry(id);
      toast.success("Time entry deleted.");
    } catch {
      toast.error("Unable to delete this entry.");
    }
  }

  if (!entries.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        No time entries yet for this day.
      </div>
    );
  }

  return (
    <LazyScrollList
      items={entries}
      getKey={(entry) => entry.id}
      pageSize={12}
      className="h-[42rem]"
      listClassName="space-y-3"
      moreLabel="Load more entries"
      empty={<p className="text-sm text-muted-foreground">No time entries yet for this day.</p>}
      renderItem={(entry) => (
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="mb-1 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <p className="min-w-0 break-words pt-1 font-semibold leading-snug text-foreground">{entry.title}</p>
            <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
              <div className="mr-3 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tracked</p>
                <p className="text-base font-semibold tabular-nums text-foreground">{formatDuration(entry.durationSec ?? 0)}</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Duplicate and start timer"
                      onClick={() =>
                        cloneToTimer({
                          title: entry.title,
                          projectId: entry.project?.id ?? null,
                          categoryId: entry.category?.id ?? null,
                          taskId: entry.taskId ?? null,
                          tags: entry.tags,
                        })
                      }
                    >
                      <Play />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Duplicate and start, pausing the current timer</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Dialog open={editingId === entry.id} onOpenChange={(open) => setEditingId(open ? entry.id : null)}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-9" aria-label="Edit entry" onClick={() => setEditingId(entry.id)}>
                    <Pencil />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit entry</DialogTitle>
                    <DialogDescription>Adjust the details for this tracked session.</DialogDescription>
                  </DialogHeader>
                  {editingEntry ? (
                    <EntryForm
                      entryId={editingEntry.id}
                      submitLabel="Update entry"
                      defaultValues={editingEntry}
                      onSuccess={() => setEditingId(null)}
                    />
                  ) : null}
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="icon" className="size-9" aria-label="Delete entry" onClick={() => handleDelete(entry.id)}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>
          <RunEventLog
            runs={entry.segments?.length ? entry.segments : [{ startAt: entry.startAt, endAt: entry.endAt }]}
            timeFormat={timeFormat}
          >
            {entry.project || entry.category || entry.tags.length ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {entry.project ? (
                  <Badge variant="outline" className="min-h-6 max-w-full break-words" style={{ borderColor: entry.project.color, color: entry.project.color }}>
                    {entry.project.name}
                  </Badge>
                ) : null}
                {entry.category ? <Badge variant="secondary" className="min-h-6 max-w-full break-words">{entry.category.name}</Badge> : null}
                {entry.tags.map((tag) => (
                  <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`} className="max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(e) => e.stopPropagation()}>
                    <Badge className="min-h-6 max-w-full cursor-pointer break-words hover:bg-primary hover:text-primary-foreground">{tag}</Badge>
                  </Link>
                ))}
              </div>
            ) : null}
            <EntryNotes notes={entry.notes} className="text-sm" />
          </RunEventLog>
        </div>
      )}
    />
  );
}
