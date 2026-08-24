"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useNotes } from "@/lib/storage/hooks/use-notes";

// TipTap uses browser-only APIs (ProseMirror, lowlight, WebWorkers).
// Skip SSR entirely so the OpenNext serverless function never attempts to
// evaluate these imports in a Node.js context.
const TiptapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-3xl" />,
  },
);

interface NoteEditorShellProps {
  noteId: string;
}

const EMPTY_TAGS: string[] = [];

export function NoteEditorShell({ noteId }: NoteEditorShellProps) {
  const router = useRouter();
  const { getNote, updateNote, deleteNote } = useNotes();
  const note = useLiveQuery(() => getNote(noteId), [noteId]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<unknown>(null);
  const [tags, setTags] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("Saved");
  const [isHydrated, setIsHydrated] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const loadedNoteIdRef = useRef<string | null>(null);
  const lastSavedPayloadRef = useRef("");
  const noteIdValue = note?.id;
  const noteTitle = note?.title ?? "";
  const noteContent = note?.content ?? null;
  const noteTags = note?.tags ?? EMPTY_TAGS;
  const noteSlug = note?.slug ?? "";

  useEffect(() => {
    if (!noteIdValue) {
      loadedNoteIdRef.current = null;
      lastSavedPayloadRef.current = "";
      queueMicrotask(() => {
        setIsHydrated(false);
      });
      return;
    }

    if (loadedNoteIdRef.current === noteIdValue) {
      return;
    }

    const snapshot = JSON.stringify({
      title: noteTitle,
      content: noteContent,
      tags: noteTags,
    });

    loadedNoteIdRef.current = noteIdValue;
    lastSavedPayloadRef.current = snapshot;
    window.setTimeout(() => {
      setTitle(noteTitle);
      setContent(noteContent);
      setTags(noteTags.join(", "));
      setSlug(noteSlug);
      setStatus("Saved");
      setIsHydrated(true);
    }, 0);
  }, [noteContent, noteIdValue, noteSlug, noteTags, noteTitle]);

  const payload = useMemo(
    () => ({
      title,
      content,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    }),
    [content, tags, title],
  );

  useEffect(() => {
    if (!noteIdValue || !isHydrated) {
      return;
    }

    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedPayloadRef.current) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      const savedNote = await updateNote(noteId, payload);

      if (!savedNote) {
        setStatus("Save failed");
        toast.error("Unable to save note changes.");
        return;
      }

      setSlug(savedNote.slug);
      lastSavedPayloadRef.current = snapshot;
      setStatus("Saved");
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [isHydrated, noteId, noteIdValue, payload, updateNote]);

  if (note === undefined) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Note not found</CardTitle>
          <CardDescription>This note may have been deleted locally.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/notes" className="text-sm font-medium text-primary hover:underline">
            Back to notes
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-primary">Note editor</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Write, connect, remember</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/notes">
            <Button variant="outline" size="sm">← All notes</Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete note
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{note.title}&quot;?</DialogTitle>
            <DialogDescription>
              This note and all its wiki-links will be permanently removed from your local storage. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteNote(noteId);
                  toast.success("Note deleted.");
                  router.push("/notes");
                } catch {
                  toast.error("Unable to delete this note.");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(event) => {
                  setStatus("Saving…");
                  setTitle(event.target.value);
                }}
                className="h-12 text-lg font-semibold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-tags">Tags</Label>
              <Input
                id="note-tags"
                value={tags}
                onChange={(event) => {
                  setStatus("Saving…");
                  setTags(event.target.value);
                }}
                placeholder="work, research, architecture"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>/{slug}</span>
              <span>{status}</span>
            </div>
          </div>
          <TiptapEditor
            content={content}
            onChange={(value) => {
              setStatus("Saving…");
              setContent(value);
            }}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Linked notes</CardTitle>
              <CardDescription>Connections surfaced from wiki links in this note.</CardDescription>
            </CardHeader>
            <CardContent>
              <LazyScrollList
                items={note.linkedNotes}
                getKey={(linkedNote) => linkedNote.id}
                pageSize={8}
                className="h-80"
                moreLabel="Load more links"
                empty={<div className="text-sm text-muted-foreground">Create <Badge>[[wiki-links]]</Badge> in the editor to connect notes.</div>}
                renderItem={(linkedNote) => (
                  <Link href={`/notes?id=${linkedNote.id}`} className="block rounded-2xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted">
                    <p className="font-medium text-foreground">{linkedNote.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">/{linkedNote.slug}</p>
                  </Link>
                )}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
