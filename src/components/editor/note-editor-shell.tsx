"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useNotes } from "@/lib/storage/hooks/use-notes";

interface NoteEditorShellProps {
  noteId: string;
}

export function NoteEditorShell({ noteId }: NoteEditorShellProps) {
  const { getNote, updateNote } = useNotes();
  const note = useLiveQuery(() => getNote(noteId), [noteId]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<unknown>(null);
  const [tags, setTags] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("Saved");

  useEffect(() => {
    if (!note) {
      return;
    }

    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags.join(", "));
    setSlug(note.slug);
    setStatus("Saved");
  }, [note]);

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
    if (!note) {
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
      setStatus("Saved");
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [note, noteId, payload, updateNote]);

  if (note === undefined) {
    return <p className="text-sm text-muted-foreground">Loading note…</p>;
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
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Note editor</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Write, connect, remember</h1>
      </div>

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
            <CardContent className="space-y-3">
              {note.linkedNotes.length ? note.linkedNotes.map((linkedNote) => (
                <Link key={linkedNote.id} href={`/notes/${linkedNote.id}`} className="block rounded-2xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted">
                  <p className="font-medium text-foreground">{linkedNote.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">/{linkedNote.slug}</p>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground">Create <Badge>[[wiki-links]]</Badge> in the editor to connect notes.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
