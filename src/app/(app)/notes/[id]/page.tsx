"use client";

import { use } from "react";

import { NoteEditorShell } from "@/components/editor/note-editor-shell";

export default function NoteEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <NoteEditorShell noteId={id} />;
}
