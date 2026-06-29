"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

interface LinkedNote {
  id: string;
  title: string;
  slug: string;
}

interface NoteEditorShellProps {
  note: {
    id: string;
    title: string;
    slug: string;
    tags: string[];
    content: unknown;
    updatedAt: string;
  };
  linkedNotes: LinkedNote[];
}

export function NoteEditorShell({ note, linkedNotes }: NoteEditorShellProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [status, setStatus] = useState("Saved");

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
    const timeout = window.setTimeout(async () => {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setStatus("Save failed");
        toast.error("Unable to save note changes.");
        return;
      }

      setStatus("Saved");
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [note.id, payload]);

  return (
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
            <span>/{note.slug}</span>
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
            {linkedNotes.length ? linkedNotes.map((linkedNote) => (
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
  );
}
