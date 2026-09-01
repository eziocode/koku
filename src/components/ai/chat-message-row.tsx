import { memo } from "react";

export type ChatRole = "user" | "assistant";

/**
 * Memoized so a token arriving for the streaming assistant message doesn't
 * re-render every prior message bubble in the conversation — only the row
 * whose `content` actually changed re-renders. Shared by the AI workspace
 * chat and the floating Koku AI panel so both stream identically.
 */
export const ChatMessageRow = memo(function ChatMessageRow({ role, content }: { role: ChatRole; content: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{role}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
        {content || (role === "assistant" ? "…" : "")}
      </p>
    </div>
  );
});
