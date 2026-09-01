"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { ChatMessageRow } from "@/components/ai/chat-message-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { applyKokuAction } from "@/lib/ai/agent/apply-action";
import { parseKokuActions, type KokuAction } from "@/lib/ai/agent/actions";
import { cliRun } from "@/lib/ai/cli/transport";
import { AI_PROVIDER_DETAILS } from "@/lib/ai/providers";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import { useNotes } from "@/lib/storage/hooks/use-notes";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: KokuAction[];
  appliedActionIndexes: number[];
};

function actionLabel(action: KokuAction) {
  if (action.type === "create_task") return `Create task "${action.title}"`;
  if (action.type === "log_time") return `Log ${action.durationMinutes}m for "${action.title}"`;
  return `Save note "${action.title}"`;
}

export function KokuAiPanel({ onClose }: { onClose: () => void }) {
  const { verifiedConnections } = useAiKeys();
  const { createNote } = useNotes();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const connection = useMemo(
    () => verifiedConnections.find((key) => key.id === connectionId) ?? verifiedConnections[0] ?? null,
    [verifiedConnections, connectionId],
  );

  async function applyAction(messageId: string, index: number, action: KokuAction) {
    try {
      await applyKokuAction(action, { createNote });
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, appliedActionIndexes: [...message.appliedActionIndexes, index] }
            : message,
        ),
      );
      toast.success("Applied.");
    } catch {
      toast.error("Unable to apply that action.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "streaming" || !connection) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const content = String(formData.get("prompt") || "").trim();
    if (!content) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content, actions: [], appliedActionIndexes: [] },
    ];
    const assistantId = crypto.randomUUID();
    setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "", actions: [], appliedActionIndexes: [] }]);
    setStatus("streaming");
    form.reset();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    function finish(rawText: string) {
      const { cleanText, actions } = parseKokuActions(rawText);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: cleanText || "No response text returned.", actions }
            : message,
        ),
      );
    }

    try {
      if (connection.authMode === "api-key") {
        const response = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            provider: connection.provider,
            apiKey: connection.apiKey,
            messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
          }),
        });

        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => null);
          const message = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Unable to reach Koku AI.";
          finish(`Error: ${message}`);
          toast.error(message);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            result += decoder.decode();
            break;
          }
          result += decoder.decode(value, { stream: true });
        }
        finish(result);
      } else {
        if (!connection.cli) {
          finish("Error: This connection is missing its CLI configuration.");
          return;
        }
        const result = await cliRun(connection.cli, content, { signal: controller.signal });
        const text = typeof result === "string" ? result : await new Response(result).text();
        finish(text);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      finish("Error: Unable to reach the AI endpoint.");
      toast.error("Unable to reach the AI endpoint.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStatus("idle");
    }
  }

  return (
    <Card className="flex h-[520px] w-[360px] flex-col shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
        <CardTitle className="text-base">Koku AI</CardTitle>
        <div className="flex items-center gap-1">
          {verifiedConnections.length > 1 ? (
            <Select value={connection?.id ?? ""} onValueChange={setConnectionId}>
              <SelectTrigger className="h-8 max-w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {verifiedConnections.map((key) => (
                  <SelectItem key={key.id} value={key.id}>
                    {AI_PROVIDER_DETAILS[key.provider as keyof typeof AI_PROVIDER_DETAILS]?.label ?? key.provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close Koku AI">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-3">
          {messages.length ? (
            messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <ChatMessageRow role={message.role} content={message.content} />
                {message.actions.map((action, index) => {
                  const applied = message.appliedActionIndexes.includes(index);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 text-xs"
                    >
                      <span className="text-foreground">{actionLabel(action)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant={applied ? "ghost" : "outline"}
                        disabled={applied}
                        onClick={() => applyAction(message.id, index, action)}
                      >
                        {applied ? "Added" : "Add"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask Koku AI to create a task, log time, or save a note. Nothing is written until you confirm it.
            </p>
          )}
        </div>
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <Input name="prompt" placeholder="Log 30m on the Q3 report" disabled={status === "streaming" || !connection} />
          <Button type="submit" disabled={status === "streaming" || !connection}>
            {status === "streaming" ? "…" : "Send"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
