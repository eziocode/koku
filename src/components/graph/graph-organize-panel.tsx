"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import { kokuDb, type Note } from "@/lib/storage/db";
import { syncRow } from "@/lib/sync/sync-engine";

interface LinkSuggestion {
  sourceId: string;
  targetId: string;
  reason: string;
}

/**
 * AI fallback for the graph's structural clustering (`detectCommunities` in
 * `@/lib/graph/palette`): that only groups notes that already share a link,
 * so an unlinked note stays "Unlinked" forever unless something looks at
 * content. This asks the model to propose links from titles/tags alone, and
 * applies only what the user confirms. api-key connections only, and only
 * rendered when one has actually tested green — same gating as Koku AI.
 */
export function GraphOrganizePanel({ notes }: { notes: Note[] }) {
  const { verifiedConnections } = useAiKeys();
  const connection = verifiedConnections.find((key) => key.authMode === "api-key") ?? null;
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());

  if (!connection) {
    return null;
  }

  const noteById = new Map(notes.map((note) => [note.id, note]));

  async function handleOrganize() {
    setLoading(true);
    setSuggestions([]);
    setAppliedKeys(new Set());

    try {
      const response = await fetch("/api/ai/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connection!.provider,
          apiKey: connection!.apiKey,
          notes: notes.map((note) => ({ id: note.id, title: note.title, tags: note.tags })),
        }),
      });

      if (!response.ok) {
        toast.error("Unable to generate link suggestions.");
        return;
      }

      const data = (await response.json()) as { links: LinkSuggestion[] };
      if (!data.links.length) {
        toast.success("No new links found.");
        return;
      }
      setSuggestions(data.links);
    } catch {
      toast.error("Unable to reach Koku AI.");
    } finally {
      setLoading(false);
    }
  }

  async function applyLink(link: LinkSuggestion) {
    const key = `${link.sourceId}:${link.targetId}`;
    const noteLink = { id: crypto.randomUUID(), sourceNoteId: link.sourceId, targetNoteId: link.targetId };
    await kokuDb.noteLinks.add(noteLink);
    void syncRow("noteLinks", noteLink);
    setAppliedKeys((current) => new Set(current).add(key));
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/90 p-2 shadow-sm backdrop-blur">
      <Button type="button" variant="outline" size="sm" onClick={handleOrganize} disabled={loading} className="justify-start gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {loading ? "Thinking…" : "Organize with AI"}
      </Button>
      {suggestions.length > 0 ? (
        <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {suggestions.map((link) => {
            const key = `${link.sourceId}:${link.targetId}`;
            const source = noteById.get(link.sourceId);
            const target = noteById.get(link.targetId);
            if (!source || !target) return null;
            const applied = appliedKeys.has(key);

            return (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/30 p-1.5 text-[11px]">
                <span className="min-w-0 truncate text-muted-foreground" title={link.reason}>
                  {source.title} ↔ {target.title}
                </span>
                <Button type="button" size="sm" variant={applied ? "ghost" : "secondary"} disabled={applied} onClick={() => applyLink(link)} className="h-6 shrink-0 px-2 text-[11px]">
                  {applied ? "Linked" : "Link"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
