"use client";

import { AiWorkspace } from "@/components/ai/ai-workspace";

export function AiClient() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">AI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Assist, summarize, and reflect</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Use your own provider keys to chat with notes, draft standups, and write richer monthly summaries.
        </p>
      </div>
      <AiWorkspace />
    </div>
  );
}
