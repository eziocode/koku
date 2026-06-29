"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { EntryForm } from "@/components/time-tracker/entry-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatDuration } from "@/lib/utils";

interface SelectOption {
  id: string;
  name: string;
}

interface EntryRecord {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  durationSec: number | null;
  tags: string[];
  notes: string | null;
  project: { id: string; name: string; color: string } | null;
  category: { id: string; name: string; color: string } | null;
}

interface DailyGridProps {
  entries: EntryRecord[];
  projects: SelectOption[];
  categories: SelectOption[];
}

export function DailyGrid({ entries, projects, categories }: DailyGridProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) || null,
    [editingId, entries],
  );

  async function handleDelete(id: string) {
    const response = await fetch(`/api/time-entries/${id}`, { method: "DELETE" });

    if (!response.ok) {
      toast.error("Unable to delete this entry.");
      return;
    }

    toast.success("Time entry deleted.");
    router.refresh();
  }

  if (!entries.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        No time entries yet for this day.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="font-semibold text-foreground">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(entry.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {entry.endAt
                      ? ` — ${new Date(entry.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : " • Running"}
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
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
              {entry.notes ? <p className="text-sm text-muted-foreground">{entry.notes}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-24 text-right text-lg font-semibold text-foreground">
                {formatDuration(entry.durationSec ?? 0)}
              </div>
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
                      projects={projects}
                      categories={categories}
                      endpoint={`/api/time-entries/${editingEntry.id}`}
                      method="PUT"
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
      ))}
    </div>
  );
}
