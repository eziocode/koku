"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { appNavigation } from "@/lib/navigation";
import { useNotes } from "@/lib/storage/hooks/use-notes";
import { useTimerStore } from "@/lib/stores/timer-store";
import { toast } from "@/components/ui/toast";

export function CommandPalette() {
  const router = useRouter();
  const { timers, startTimer } = useTimerStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { notes, createNote } = useNotes(query);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const navigationItems = useMemo(
    () => appNavigation.map((item) => ({ value: item.title, href: item.href })),
    [],
  );
  const noteResults = notes.slice(0, 8);

  async function createQuickNote() {
    const note = await createNote({
      title: "Quick note",
      tags: ["quick"],
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    setOpen(false);
    router.push(`/notes?id=${note.id}`);
  }

  function startQuickTimer() {
    if (timers.length > 0) {
      setOpen(false);
      router.push("/log");
      toast.error("Stop and save active timers before starting another.");
      return;
    }

    const started = startTimer({
      title: "Quick focus",
      startTime: new Date().toISOString(),
      projectId: null,
      categoryId: null,
      pomodoroMode: false,
    });

    if (!started) {
      toast.error("Stop and save active timers before starting another.");
      return;
    }

    setOpen(false);
    router.push("/log");
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Palette"
      className="fixed left-1/2 top-24 z-50 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-black/20"
    >
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search notes, jump to views, or trigger quick actions…"
          className="h-14 w-full border-b border-border bg-transparent px-5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-[420px] overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          <Command.Group heading="Quick actions" className="px-2 py-2 text-xs text-muted-foreground">
            <Command.Item onSelect={startQuickTimer} className="rounded-2xl px-3 py-2 text-sm aria-selected:bg-muted">
              Start timer
            </Command.Item>
            <Command.Item onSelect={createQuickNote} className="rounded-2xl px-3 py-2 text-sm aria-selected:bg-muted">
              Create note
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Navigate" className="px-2 py-2 text-xs text-muted-foreground">
            {navigationItems.map((item) => (
              <Command.Item
                key={item.href}
                value={item.value}
                onSelect={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className="rounded-2xl px-3 py-2 text-sm aria-selected:bg-muted"
              >
                {item.value}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Notes" className="px-2 py-2 text-xs text-muted-foreground">
            {noteResults.map((note) => (
              <Command.Item
                key={note.id}
                value={note.title}
                onSelect={() => {
                  setOpen(false);
                  router.push(`/notes?id=${note.id}`);
                }}
                className="rounded-2xl px-3 py-2 text-sm aria-selected:bg-muted"
              >
                {note.title}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
