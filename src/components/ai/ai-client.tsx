"use client";

import { AiWorkspace } from "@/components/ai/ai-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { BetaBadge } from "@/components/ui/beta-badge";

export function AiClient() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI"
        badge={<BetaBadge />}
        title="Assist, summarize, and reflect"
        description="Use your own provider keys to chat with notes, draft standups, and write richer monthly summaries."
      />
      <AiWorkspace />
    </div>
  );
}
