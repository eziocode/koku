"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { NoteEditorShell } from "@/components/editor/note-editor-shell";
import { NotesBrowser } from "@/components/notes/notes-browser";
import { NotesBySlug } from "@/components/notes/notes-by-slug";

function NotesContent() {
  const params = useSearchParams();
  const id = params.get("id");
  const slug = params.get("slug");

  if (id) return <NoteEditorShell noteId={id} />;
  if (slug) return <NotesBySlug slug={slug} />;
  return <NotesBrowser />;
}

export default function NotesPage() {
  return (
    <Suspense>
      <NotesContent />
    </Suspense>
  );
}
