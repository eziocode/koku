"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface NoteRecord {
  id: string;
  title: string;
  slug: string;
  tags: string[];
  updatedAt: string;
  createdAt: string;
}

function fuzzyScore(value: string, query: string) {
  const text = value.toLowerCase();
  const search = query.toLowerCase();

  if (!search) {
    return 1;
  }

  if (text.includes(search)) {
    return search.length / text.length + 1;
  }

  let textIndex = 0;
  let queryIndex = 0;

  while (textIndex < text.length && queryIndex < search.length) {
    if (text[textIndex] === search[queryIndex]) {
      queryIndex += 1;
    }
    textIndex += 1;
  }

  return queryIndex === search.length ? queryIndex / text.length : 0;
}

export function NotesBrowser({ notes }: { notes: NoteRecord[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))).sort(), [notes]);

  const filteredNotes = useMemo(() => {
    return notes
      .map((note) => ({
        note,
        score: fuzzyScore(`${note.title} ${note.tags.join(" ")}`, search),
      }))
      .filter(({ note, score }) => score > 0 && (activeTag === "all" || note.tags.includes(activeTag)))
      .sort((left, right) => right.score - left.score)
      .map(({ note }) => note);
  }, [activeTag, notes, search]);

  async function handleCreateNote() {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Untitled note",
        tags: [],
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      toast.error("Unable to create note.");
      return;
    }

    const note = await response.json();
    toast.success("Note created.");
    router.push(`/notes/${note.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes with fuzzy matching" className="pl-9" />
        </div>
        <Button onClick={handleCreateNote}>Create new note</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={activeTag === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveTag("all")}>All</Button>
        {tags.map((tag) => (
          <Button key={tag} variant={activeTag === tag ? "default" : "outline"} size="sm" onClick={() => setActiveTag(tag)}>
            {tag}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredNotes.map((note) => (
          <button key={note.id} type="button" className="text-left" onClick={() => router.push(`/notes/${note.id}`)}>
            <Card className="h-full transition-transform hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
              <CardHeader>
                <CardTitle>{note.title}</CardTitle>
                <CardDescription>Updated {new Date(note.updatedAt).toLocaleDateString()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {note.tags.length ? note.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <Badge variant="outline">No tags</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">/{note.slug}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
