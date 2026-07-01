"use client";

import Link from "next/link";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { kokuDb } from "@/lib/storage/db";
import { NoteEditorShell } from "@/components/editor/note-editor-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface NotesBySlugProps { slug: string; }

export function NotesBySlug({ slug }: NotesBySlugProps) {
  const note = useLiveQuery(
    () => kokuDb.notes.where("slug").equals(slug).first(),
    [slug],
  );

  if (note === undefined) {
    return <Skeleton className="h-64 w-full rounded-3xl" />;
  }

  if (!note) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Note not found</CardTitle>
          <CardDescription>No note matched the slug /{slug}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/notes" className="text-sm font-medium text-primary hover:underline">
            Back to notes
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <NoteEditorShell noteId={note.id} />;
}