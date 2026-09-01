"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
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
import { useCloneToTimer } from "@/components/time-tracker/use-clone-to-timer";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { formatTime } from "@/lib/time-format";
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
      listClassName="space-y-4"
      moreLabel="Load more entries"
      empty={<p className="text-sm text-muted-foreground">No time entries yet for this day.</p>}
      renderItem={(entry) => (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="font-semibold text-foreground">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.segments && entry.segments.length > 1
                      ? entry.segments
                          .map(
                            (segment) =>
                              `${formatTime(segment.startAt, timeFormat)} - ${formatTime(segment.endAt, timeFormat)}`,
                          )
                          .join(", ")
                      : `${formatTime(entry.startAt, timeFormat)}${
                          entry.endAt ? ` - ${formatTime(entry.endAt, timeFormat)}` : " • Running"
                        }`}
                  </p>
                </div>
                {entry.project ? (
                  <Badge variant="outline" style={{ borderColor: entry.project.color, color: entry.project.color }}>
                    {entry.project.name}
                  </Badge>
                ) : null}
                {entry.category ? <Badge variant="secondary">{entry.category.name}</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`} onClick={(e) => e.stopPropagation()}>
                    <Badge className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground">
                      {tag}
                    </Badge>
                  </Link>
                ))}
              </div>
              <EntryNotes notes={entry.notes} />
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-24 text-right text-lg font-semibold text-foreground">
                {formatDuration(entry.durationSec ?? 0)}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Copy to timer"
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
                      <Copy />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy to timer</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Dialog open={editingId === entry.id} onOpenChange={(open) => setEditingId(open ? entry.id : null)}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setEditingId(entry.id)}>
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
              <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      )}
    />
  );
}
