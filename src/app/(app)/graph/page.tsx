import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function GraphPage() {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const [notes, links] = await Promise.all([
    db.note.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, title: true, tags: true },
    }),
    db.noteLink.findMany({
      where: {
        sourceNote: {
          workspaceId: workspace.id,
        },
      },
      select: { id: true, sourceNoteId: true, targetNoteId: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Knowledge graph</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">See your ideas converge</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Explore linked notes, thematic clusters, and bridges between projects in one interactive canvas.
        </p>
      </div>
      <KnowledgeGraph
        nodes={notes}
        edges={links.map((link) => ({
          id: link.id,
          source: link.sourceNoteId,
          target: link.targetNoteId,
        }))}
      />
    </div>
  );
}
