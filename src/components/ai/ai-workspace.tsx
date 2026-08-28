"use client";

import { endOfDay, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthPicker } from "@/components/ui/month-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { AI_PROVIDER_DETAILS } from "@/lib/ai/providers";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import { useCategories } from "@/lib/storage/hooks/use-categories";
import { useNotes } from "@/lib/storage/hooks/use-notes";
import { useProjects } from "@/lib/storage/hooks/use-projects";
import { useTimeEntries } from "@/lib/storage/hooks/use-time-entries";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/**
 * Memoized so a token arriving for the streaming assistant message doesn't
 * re-render every prior message bubble in the conversation — only the row
 * whose `content` actually changed re-renders.
 */
const ChatMessageRow = memo(function ChatMessageRow({ role, content }: { role: ChatMessage["role"]; content: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{role}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
        {content || (role === "assistant" ? "…" : "")}
      </p>
    </div>
  );
});

async function getResponseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }

  return fallback;
}

export function AiWorkspace() {
  const { aiKeys, getApiKeyForProvider } = useAiKeys();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { notes } = useNotes();
  const [selectedProvider, setSelectedProvider] = useState("openai");
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

  const availableProviders = useMemo(
    () => Array.from(new Set(aiKeys.map((key) => key.provider))),
    [aiKeys],
  );
  const provider = availableProviders.includes(selectedProvider)
    ? selectedProvider
    : availableProviders[0] ?? "openai";
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

  async function getApiKey() {
    const apiKey = await getApiKeyForProvider(provider);
    if (!apiKey) {
      toast.error("No credential stored for this provider.");
      return null;
    }
    return apiKey;
  }

  async function handleTestConnection() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return;
    }

    setTestingConnection(true);

    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });

      if (!response.ok) {
        toast.error(await getResponseError(response, "Connection test failed."));
        return;
      }

      toast.success("Connection successful.");
    } catch {
      toast.error("Unable to reach the connection test endpoint.");
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleStandup() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return;
    }

    const response = await fetch("/api/ai/standup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey,
        entries: todayEntries.map((entry) => ({
          title: entry.title,
          projectName: entry.projectId ? projectMap.get(entry.projectId) || "Unassigned" : "Unassigned",
          durationSec: entry.durationSec || 0,
        })),
      }),
    });

    if (!response.ok) {
      toast.error(await getResponseError(response, "Unable to generate standup."));
      return;
    }

    const data = await response.json();
    setStandup(data.text);
  }

  async function handleMonthlyNarrative() {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return;
    }

    const response = await fetch("/api/ai/monthly-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey,
        month,
        entries: monthlyEntries.map((entry) => ({
          title: entry.title,
          projectName: entry.projectId ? projectMap.get(entry.projectId) || "Unassigned" : "Unassigned",
          categoryName: entry.categoryId ? categoryMap.get(entry.categoryId) || undefined : undefined,
          durationSec: entry.durationSec || 0,
          notes: entry.notes || null,
        })),
      }),
    });

    if (!response.ok) {
      toast.error(await getResponseError(response, "Unable to generate monthly narrative."));
      return;
    }

    const data = await response.json();
    setMonthlyNarrative(data.text);
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chatStatus === "streaming") {
      toast.error("Wait for the current response to finish before sending another message.");
      return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
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
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider,
          apiKey,
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

  if (!availableProviders.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No AI providers configured</CardTitle>
          <CardDescription>
            Add a local provider credential in Settings → AI Keys to unlock chat,
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
          <Select value={provider} onValueChange={setSelectedProvider}>
            <SelectTrigger className="max-w-[220px]">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {availableProviders.map((value) => (
                <SelectItem key={value} value={value}>
                  {AI_PROVIDER_DETAILS[value as keyof typeof AI_PROVIDER_DETAILS]?.label ?? value}
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
