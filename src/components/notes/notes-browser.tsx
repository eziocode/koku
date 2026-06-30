"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useNotes } from "@/lib/storage/hooks/use-notes";

export function NotesBrowser() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");
  const { notes, createNote } = useNotes(search);
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))).sort(), [notes]);

  const filteredNotes = useMemo(
    () => notes.filter((note) => activeTag === "all" || note.tags.includes(activeTag)),
    [activeTag, notes],
  );

  async function handleCreateNote() {
    try {
      const note = await createNote({
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
      });
      toast.success("Note created.");
      router.push(`/notes/${note.id}`);
    } catch {
      toast.error("Unable to create note.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Notes</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connected knowledge</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search across notes, filter by tag, and open ideas in an editor designed for durable thought.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes by title or tag" className="pl-9" />
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
    </div>
  );
}
