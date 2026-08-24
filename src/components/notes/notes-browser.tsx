"use client";

import { CalendarDays, Grid2X2, List, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { useNotes } from "@/lib/storage/hooks/use-notes";

type CreatedDateFilter = "all" | "today" | "yesterday" | "week" | "month" | "exact";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function noteDateKey(value: string) {
  return dateKey(new Date(value));
}

const createdDateFilterLabels: Record<CreatedDateFilter, string> = {
  all: "Any date",
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  exact: "Specific date",
};

export function NotesBrowser() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");
  const [createdDateFilter, setCreatedDateFilter] = useState<CreatedDateFilter>("all");
  const [createdDate, setCreatedDate] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { notes, createNote, deleteNote } = useNotes();
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))).sort(), [notes]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();
    const today = dateKey(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterday = dateKey(yesterdayDate);
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartKey = dateKey(weekStart);
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    return notes.filter((note) => {
      const matchesTag = activeTag === "all" || note.tags.includes(activeTag);
      const matchesSearch = !query || `${note.title} ${note.tags.join(" ")}`.toLowerCase().includes(query);
      const noteCreatedDate = noteDateKey(note.createdAt);
      const matchesCreatedDate =
        createdDateFilter === "all"
        || (createdDateFilter === "today" && noteCreatedDate === today)
        || (createdDateFilter === "yesterday" && noteCreatedDate === yesterday)
        || (createdDateFilter === "week" && noteCreatedDate >= weekStartKey && noteCreatedDate <= today)
        || (createdDateFilter === "month" && noteCreatedDate.startsWith(monthPrefix))
        || (createdDateFilter === "exact" && noteCreatedDate === createdDate);
      return matchesTag && matchesSearch && matchesCreatedDate;
    });
  }, [activeTag, createdDate, createdDateFilter, notes, search]);

  const notesByDate = useMemo(() => {
    const groups = new Map<string, typeof filteredNotes>();
    [...filteredNotes]
      .sort((a, b) => {
        const aDate = createdDateFilter === "all" ? a.updatedAt : a.createdAt;
        const bDate = createdDateFilter === "all" ? b.updatedAt : b.createdAt;
        return bDate.localeCompare(aDate);
      })
      .forEach((note) => {
        const day = noteDateKey(createdDateFilter === "all" ? note.updatedAt : note.createdAt);
        groups.set(day, [...(groups.get(day) ?? []), note]);
      });
    return [...groups.entries()];
  }, [createdDateFilter, filteredNotes]);

  const activeFilterCount = Number(activeTag !== "all") + Number(createdDateFilter !== "all");

  function setDateFilter(filter: CreatedDateFilter) {
    setCreatedDateFilter(filter);
    if (filter === "exact" && !createdDate) setCreatedDate(dateKey(new Date()));
  }

  function openCreateDialog() {
    setNewTitle("");
    setCreateOpen(true);
    setTimeout(() => titleInputRef.current?.focus(), 80);
  }

  async function handleConfirmCreate() {
    const title = newTitle.trim() || "Untitled note";
    setCreating(true);
    try {
      const note = await createNote({
        title,
        tags: [],
        content: { type: "doc", content: [{ type: "paragraph" }] },
      });
      setCreateOpen(false);
      toast.success("Note created.");
      router.push(`/notes?id=${note.id}`);
    } catch {
      toast.error("Unable to create note.");
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNote(deleteTarget.id);
      toast.success("Note deleted.");
      setDeleteTarget(null);
    } catch {
      toast.error("Unable to delete this note.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Notes</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connected knowledge</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search, filter by tags or creation date, and open ideas in an editor designed for durable thought.
        </p>
      </div>

      {/* Create note dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
            <DialogDescription>Give your note a title to get started. You can change it any time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-note-title">Title</Label>
            <Input
              id="new-note-title"
              ref={titleInputRef}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="e.g. Design principles"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleConfirmCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmCreate} disabled={creating}>
              {creating ? "Creating…" : "Create note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleteTarget?.title}&quot;?</DialogTitle>
            <DialogDescription>
              This note and all its wiki-links will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes by title or tag" className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" aria-label="Smart filters">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Smart filters</span>
                  {activeFilterCount > 0 && <Badge className="h-5 min-w-5 justify-center rounded-full px-1">{activeFilterCount}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-4 p-3">
                <div>
                  <div className="flex items-center gap-2 px-1 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-primary" />Created date
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {(Object.keys(createdDateFilterLabels) as CreatedDateFilter[]).map((filter) => (
                      <Button
                        key={filter}
                        type="button"
                        variant={createdDateFilter === filter ? "secondary" : "ghost"}
                        size="sm"
                        className="justify-start"
                        onClick={() => setDateFilter(filter)}
                      >
                        {createdDateFilterLabels[filter]}
                      </Button>
                    ))}
                  </div>
                  {createdDateFilter === "exact" && (
                    <div className="mt-2 px-1">
                      <Label htmlFor="note-created-date" className="text-xs text-muted-foreground">Created on</Label>
                      <Input id="note-created-date" type="date" value={createdDate} onChange={(event) => setCreatedDate(event.target.value)} className="mt-1" />
                    </div>
                  )}
                </div>
                <div className="border-t pt-3">
                  <p className="px-1 text-sm font-semibold">Tags</p>
                  <div className="mt-2 flex max-h-36 flex-wrap gap-1 overflow-y-auto pr-1">
                    <Button type="button" variant={activeTag === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTag("all")}>All notes <span className="opacity-70">{notes.length}</span></Button>
                    {tags.map((tag) => <Button key={tag} type="button" variant={activeTag === tag ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTag(tag)}>{tag} <span className="opacity-70">{notes.filter((note) => note.tags.includes(tag)).length}</span></Button>)}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex rounded-lg border p-1" aria-label="Note view">
              <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" aria-label="Grid view" onClick={() => setView("grid")}><Grid2X2 /></Button>
              <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" aria-label="List view" onClick={() => setView("list")}><List /></Button>
            </div>
            <Button onClick={openCreateDialog}>Create new note</Button>
          </div>
        </div>

        {notesByDate.length ? notesByDate.map(([day, dayNotes]) => (
          <section key={day} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{createdDateFilter === "all" ? "Updated " : "Created "}{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}</h2>
            <div className={view === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
              {dayNotes.map((note) => (
                <div key={note.id} className="group relative">
                  <button type="button" className="w-full text-left" onClick={() => router.push(`/notes?id=${note.id}`)}>
                    {view === "grid" ? (
                      <Card className="h-full transition-transform hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
                        <CardHeader>
                          <CardTitle>{note.title}</CardTitle>
                          <CardDescription>Updated {new Date(note.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {note.tags.length ? note.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <Badge variant="outline">No tags</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">/{note.slug}</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="transition-colors hover:border-primary/20 hover:bg-muted/20">
                        <CardContent className="flex min-h-12 items-center gap-3 px-4 py-2.5 pr-12">
                          <CardTitle className="min-w-0 flex-1 truncate text-base">{note.title}</CardTitle>
                          <div className="hidden max-w-[40%] gap-1 overflow-hidden sm:flex">
                            {note.tags.length ? note.tags.map((tag) => <Badge key={tag} className="shrink-0">{tag}</Badge>) : <Badge variant="outline" className="shrink-0">No tags</Badge>}
                          </div>
                          <CardDescription className="shrink-0">{new Date(note.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</CardDescription>
                        </CardContent>
                      </Card>
                    )}
                  </button>
                  <button type="button" aria-label="Delete note" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: note.id, title: note.title }); }} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )) : <p className="text-sm text-muted-foreground">No notes found.</p>}
      </div>
    </div>
  );
}
