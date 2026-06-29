import { AiWorkspace } from "@/components/ai/ai-workspace";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AiPage() {
  const session = await auth();
  const keys = await db.aiKey.findMany({
    where: { userId: session!.user.id },
    select: { provider: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">AI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Assist, summarize, and reflect</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Use your own provider keys to chat with notes, draft standups, and write richer monthly summaries.</p>
      </div>
      <AiWorkspace providers={keys.map((key) => key.provider)} />
    </div>
  );
}
