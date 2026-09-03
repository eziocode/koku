"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { appNavigation } from "@/lib/navigation";
import { startQuickTimer } from "@/lib/time-tracking/quick-timer";
import { useNotes } from "@/lib/storage/hooks/use-notes";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { useTimerStore } from "@/lib/stores/timer-store";
import { toast } from "@/components/ui/toast";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opens the timed-start dialog. Owned by `ShortcutsProvider` rather than
   * rendered here, so it never nests a second Radix dialog inside
   * `Command.Dialog` and fights it over focus trapping.
   */
  onRequestTimedTimer: () => void;
}

/**
 * Open state is lifted to `ShortcutsProvider`, which owns the single global
 * keyboard listener (`⌘K`/`Ctrl+K` included) — see `lib/ui/shortcuts.ts` for
 * why that shortcut moved out of this component's own `keydown` handler.
 */
export function CommandPalette({ open, onOpenChange, onRequestTimedTimer }: CommandPaletteProps) {
  const router = useRouter();
  const { timers, activeBreak, startTimer } = useTimerStore();
  const { prefs } = useNotificationPreferences();
  const [query, setQuery] = useState("");
  const { notes, createNote } = useNotes(query);

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
    onOpenChange(false);
    router.push(`/notes?id=${note.id}`);
  }

  function handleStartQuickTimer() {
    const result = startQuickTimer({
      timers,
      activeBreak,
      blockNewTimers: prefs.breaks.blockNewTimers,
      startTimer,
    });

    if (result.status !== "started") {
      onOpenChange(false);
      router.push("/log");
      toast.error(result.message);
      return;
    }

    onOpenChange(false);
    router.push("/log");
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
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
            <Command.Item onSelect={handleStartQuickTimer} className="rounded-2xl px-3 py-2 text-sm aria-selected:bg-muted">
              Start timer
            </Command.Item>
            <Command.Item
              onSelect={() => {
                onOpenChange(false);
                onRequestTimedTimer();
              }}
              className="rounded-2xl px-3 py-2 text-sm aria-selected:bg-muted"
            >
              Start timer for a set time…
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
                  onOpenChange(false);
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
                  onOpenChange(false);
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
