import { NotesBrowser } from "@/components/notes/notes-browser";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function NotesPage() {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const notes = await db.note.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Notes</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connected knowledge</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search across notes, filter by tag, and open ideas in an editor designed for durable thought.
        </p>
      </div>
      <NotesBrowser
        notes={notes.map((note) => ({
          ...note,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
