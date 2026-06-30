"use client";

import { useParams } from "next/navigation";

import { NoteEditorShell } from "@/components/editor/note-editor-shell";

export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <NoteEditorShell noteId={id} />;
}
