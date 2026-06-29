import { notFound } from "next/navigation";

import { NoteEditorShell } from "@/components/editor/note-editor-shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function NoteEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const { id } = await params;

  const note = await db.note.findFirst({
    where: { id, workspaceId: workspace.id },
  });

  if (!note) {
    notFound();
  }

  const links = await db.noteLink.findMany({
    where: { sourceNoteId: note.id },
    include: {
      targetNote: {
        select: { id: true, title: true, slug: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Note editor</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Write, connect, remember</h1>
      </div>
      <NoteEditorShell
        note={{
          id: note.id,
          title: note.title,
          slug: note.slug,
          tags: note.tags,
          content: note.content,
          updatedAt: note.updatedAt.toISOString(),
        }}
        linkedNotes={links.map((link) => link.targetNote)}
      />
    </div>
  );
}
