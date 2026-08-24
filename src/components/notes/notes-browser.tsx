"use client";

import { Search, Trash2 } from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import { useNotes } from "@/lib/storage/hooks/use-notes";

export function NotesBrowser() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");
  const { notes, createNote, deleteNote } = useNotes(search);
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))).sort(), [notes]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredNotes = useMemo(
    () => notes.filter((note) => activeTag === "all" || note.tags.includes(activeTag)),
    [activeTag, notes],
  );

  const notesByDate = useMemo(() => {
    const groups = new Map<string, typeof filteredNotes>();
    [...filteredNotes]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((note) => {
        const day = note.updatedAt.slice(0, 10);
        groups.set(day, [...(groups.get(day) ?? []), note]);
      });
    return [...groups.entries()];
  }, [filteredNotes]);

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
          Search across notes, filter by tag, and open ideas in an editor designed for durable thought.
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
          <Button onClick={openCreateDialog}>Create new note</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={activeTag === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveTag("all")}>All</Button>
          {tags.map((tag) => (
            <Button key={tag} variant={activeTag === tag ? "default" : "outline"} size="sm" onClick={() => setActiveTag(tag)}>
              {tag}
            </Button>
          ))}
        </div>

        {notesByDate.length ? notesByDate.map(([day, dayNotes]) => (
          <section key={day} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dayNotes.map((note) => (
                <div key={note.id} className="group relative">
                  <button type="button" className="w-full text-left" onClick={() => router.push(`/notes?id=${note.id}`)}>
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
