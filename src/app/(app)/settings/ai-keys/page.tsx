import { AiKeyManager } from "@/components/settings/ai-key-manager";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AiKeysPage() {
  const session = await auth();
  const keys = await db.aiKey.findMany({
    where: { userId: session!.user.id },
    select: { id: true, provider: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">AI Keys</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Provider credentials</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Store encrypted API keys for OpenAI, Anthropic, Gemini, or Groq-backed workflows.</p>
      </div>
      <AiKeyManager keys={keys.map((key) => ({ ...key, createdAt: key.createdAt.toISOString() }))} />
    </div>
  );
}
