"use client";

import { endOfDay, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthPicker } from "@/components/ui/month-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ChatMessageRow } from "@/components/ai/chat-message-row";
import { cliStatus } from "@/lib/ai/cli/transport";
import { runAiText } from "@/lib/ai/client/run-ai";
import { AI_PROVIDER_DETAILS } from "@/lib/ai/providers";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import type { AiKey } from "@/lib/storage/db";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useNotes } from "@/lib/storage/hooks/use-notes";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

async function getResponseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }

  return fallback;
}

export function AiWorkspace() {
  const { aiKeys, markVerified } = useAiKeys();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { notes } = useNotes();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [standup, setStandup] = useState("");
  const [monthlyNarrative, setMonthlyNarrative] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatStatus, setChatStatus] = useState<"idle" | "streaming">("idle");
  const [testingConnection, setTestingConnection] = useState(false);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const abortRef = useRef<AbortController | null>(null);
  const today = useMemo(() => new Date(), []);
  const monthDate = useMemo(() => {
    const parsed = new Date(`${month}-01T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [month]);

  useEffect(() => () => abortRef.current?.abort(), []);
  const { entries: todayEntries } = useTimeEntries({
    from: startOfDay(today).toISOString(),
    to: endOfDay(today).toISOString(),
  });
  const { entries: monthlyEntries } = useTimeEntries({
    from: startOfMonth(monthDate).toISOString(),
    to: endOfMonth(monthDate).toISOString(),
  });

  const connection: AiKey | null =
    aiKeys.find((key) => key.id === selectedConnectionId) ?? aiKeys[0] ?? null;
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const noteContext = useMemo(
    () =>
      notes.slice(0, 8).map((note) => ({
        title: note.title,
        tags: note.tags,
        content: note.content,
      })),
    [notes],
  );

  function requireConnection(): AiKey | null {
    if (!connection) {
      toast.error("No AI connection is configured.");
      return null;
    }
    return connection;
  }

  async function handleTestConnection() {
    const active = requireConnection();
    if (!active) {
      return;
    }

    setTestingConnection(true);

    try {
      if (active.authMode === "api-key") {
        const response = await fetch("/api/ai/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: active.provider, apiKey: active.apiKey }),
        });

        if (!response.ok) {
          toast.error(await getResponseError(response, "Connection test failed."));
          return;
        }
      } else if (active.cli) {
        const status = await cliStatus(active.cli);
        if (!status.installed) {
          toast.error("The configured CLI was not found.");
          return;
        }
      } else {
        toast.error("This connection is missing its CLI configuration.");
        return;
      }

      await markVerified(active.id);
      toast.success("Connection successful.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reach the connection test endpoint.");
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleStandup() {
    const active = requireConnection();
    if (!active) {
      return;
    }

    try {
      const entries = todayEntries.map((entry) => ({
        title: entry.title,
        projectName: entry.projectId ? projectMap.get(entry.projectId) || "Unassigned" : "Unassigned",
        durationSec: entry.durationSec || 0,
      }));

      const text = await runAiText(active, {
        endpoint: "/api/ai/standup",
        body: { entries },
        prompt: `Write a concise daily standup update from these tracked entries: ${JSON.stringify(entries)}`,
      });

      setStandup(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate standup.");
    }
  }

  async function handleMonthlyNarrative() {
    const active = requireConnection();
    if (!active) {
      return;
    }

    try {
      const entries = monthlyEntries.map((entry) => ({
        title: entry.title,
        projectName: entry.projectId ? projectMap.get(entry.projectId) || "Unassigned" : "Unassigned",
        categoryName: entry.categoryId ? categoryMap.get(entry.categoryId) || undefined : undefined,
        durationSec: entry.durationSec || 0,
        notes: entry.notes || null,
      }));

      const text = await runAiText(active, {
        endpoint: "/api/ai/monthly-report",
        body: { month, entries },
        prompt: `Write a reflective monthly narrative for ${month} from these tracked entries: ${JSON.stringify(entries)}`,
      });

      setMonthlyNarrative(text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate monthly narrative.");
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chatStatus === "streaming") {
      toast.error("Wait for the current response to finish before sending another message.");
      return;
    }

    const active = requireConnection();
    if (!active) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const content = String(formData.get("prompt") || "").trim();

    if (!content) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
      },
    ];

    const assistantId = crypto.randomUUID();
    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);
    setChatStatus("streaming");
    form.reset();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (active.authMode !== "api-key") {
        // CLI connections have no streaming transport, so run the whole
        // exchange as one call and land it in a single flush.
        const text = await runAiText(
          active,
          {
            endpoint: "",
            body: {},
            prompt: `${content}\n\nRecent notes for context: ${JSON.stringify(noteContext)}`,
          },
          { signal: controller.signal },
        );
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId ? { ...entry, content: text || "No response text returned." } : entry,
          ),
        );
        return;
      }

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider: active.provider,
          apiKey: active.apiKey,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          notes: noteContext,
        }),
      });

      if (!response.ok) {
        const message = await getResponseError(response, "Unable to stream AI response.");
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId ? { ...entry, content: `Error: ${message}` } : entry,
          ),
        );
        toast.error(message);
        return;
      }

      if (!response.body) {
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId ? { ...entry, content: "Error: No response stream was returned." } : entry,
          ),
        );
        toast.error("No response stream was returned.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";

      // The provider can emit many small chunks per second. Applying a state
      // update — and re-rendering the whole message list — on every single
      // chunk is what made the chat feel sluggish. Coalesce chunks and flush
      // at most once per animation frame instead.
      let flushScheduled = false;
      let rafId: number | null = null;
      const flush = () => {
        flushScheduled = false;
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId ? { ...entry, content: result } : entry,
          ),
        );
      };
      const scheduleFlush = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        rafId = requestAnimationFrame(flush);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          result += decoder.decode();
          break;
        }

        result += decoder.decode(value, { stream: true });
        scheduleFlush();
      }

      if (rafId !== null) cancelAnimationFrame(rafId);
      setMessages((current) =>
        current.map((entry) =>
          entry.id === assistantId ? { ...entry, content: result || "No response text returned." } : entry,
        ),
      );
    } catch (error) {
      // A deliberate abort (unmount or a new submission) is not an error.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessages((current) =>
        current.map((entry) =>
          entry.id === assistantId ? { ...entry, content: "Error: Unable to reach the AI endpoint." } : entry,
        ),
      );
      toast.error("Unable to reach the AI endpoint.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setChatStatus("idle");
    }
  }

  if (!aiKeys.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No AI connections configured</CardTitle>
          <CardDescription>
            Add an AI key, local CLI, or org login in Settings → AI Keys to unlock chat,
            standups, and monthly narratives.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="chat" className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <TabsList>
          <TabsTrigger value="chat">Chat with Notes</TabsTrigger>
          <TabsTrigger value="standup">Generate Standup</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Report Writer</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={connection?.id ?? ""} onValueChange={setSelectedConnectionId}>
            <SelectTrigger className="max-w-[260px]">
              <SelectValue placeholder="Connection" />
            </SelectTrigger>
            <SelectContent>
              {aiKeys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {AI_PROVIDER_DETAILS[key.provider as keyof typeof AI_PROVIDER_DETAILS]?.label ?? key.provider}
                  {key.authMode !== "api-key" ? " (CLI)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={testingConnection}
          >
            {testingConnection ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </div>

      <TabsContent value="chat">
        <Card>
          <CardHeader>
            <CardTitle>Chat with your notes</CardTitle>
            <CardDescription>
              Ask grounded questions and stream a response from your selected provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-3xl border border-border bg-muted/20 p-4">
              {messages.length ? (
                messages.map((message) => (
                  <ChatMessageRow key={message.id} role={message.role} content={message.content} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ask about recent notes, summarize a project, or request a focused action plan.
                </p>
              )}
            </div>
            <form className="flex gap-3" onSubmit={handleChatSubmit}>
              <Input
                name="prompt"
                placeholder="Summarize my recent product notes"
                disabled={chatStatus === "streaming"}
              />
              <Button type="submit" disabled={chatStatus === "streaming"}>
                {chatStatus === "streaming" ? "Streaming…" : "Send"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="standup">
        <Card>
          <CardHeader>
            <CardTitle>Daily standup</CardTitle>
            <CardDescription>Generate an update from today’s tracked work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleStandup}>Generate standup</Button>
            <Textarea value={standup} onChange={(event) => setStandup(event.target.value)} className="min-h-64" />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="monthly">
        <Card>
          <CardHeader>
            <CardTitle>Monthly narrative</CardTitle>
            <CardDescription>Craft a reflective monthly summary grounded in your data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MonthPicker value={month} onChange={setMonth} className="max-w-[220px]" />
            <Button onClick={handleMonthlyNarrative}>Generate narrative</Button>
            <Textarea value={monthlyNarrative} onChange={(event) => setMonthlyNarrative(event.target.value)} className="min-h-72" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
