import { NoteEditorShell } from "@/components/editor/note-editor-shell";

export default async function NoteEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <NoteEditorShell noteId={id} />;
}
