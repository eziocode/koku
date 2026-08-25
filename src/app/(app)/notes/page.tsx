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
  const scope = params.get("tab") === "personal" ? "personal" : "shared";

  if (id) return <NoteEditorShell noteId={id} scope={scope} />;
  if (slug) return <NotesBySlug slug={slug} />;
  return <NotesBrowser scope={scope} />;
}

export default function NotesPage() {
  return (
    <Suspense>
      <NotesContent />
    </Suspense>
  );
}
