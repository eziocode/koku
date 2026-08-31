"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/ui/markdown-text";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { parseNoteLines } from "@/lib/stores/timer-notes";
import { cn } from "@/lib/utils";

/**
 * Notes attached to a time entry, log-item, or running session, rendered per
 * the `entryNotesDisplay` setting so the dashboard, log page, and timer stay
 * consistent: "always" shows the text (long bodies clamp behind Show more,
 * matching `AdminNoteRow`'s admin panel treatment), "on-demand" starts
 * collapsed behind a note count.
 *
 * Renders nothing when there is no text, so a note-free entry is unchanged.
 */
export function EntryNotes({ notes, className }: { notes: string | null | undefined; className?: string }) {
  const { value: display } = useTypedSetting("entryNotesDisplay");
  // Only meaningful in "on-demand" mode, where a note starts collapsed and the
  // user can open it; "always" mode never reads this, so there's no derived-
  // from-setting initial value to get wrong while the setting is still loading.
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const lines = useMemo(() => parseNoteLines(notes), [notes]);
  if (!notes || !notes.trim() || lines.length === 0) return null;

  const countLabel = lines.length === 1 ? "1 note" : `${lines.length} notes`;
  const isLong = notes.length > 180 || notes.includes("\n");

  if (display === "on-demand" && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn("flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground", className)}
      >
        <ChevronDown className="h-3.5 w-3.5" />
        {countLabel}
      </button>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {display === "on-demand" ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Hide {countLabel}
        </button>
      ) : null}
      <MarkdownText
        text={notes}
        className={cn("break-words text-muted-foreground", !showFull && "line-clamp-3")}
      />
      {isLong ? (
        <Button variant="ghost" size="sm" className="h-auto px-0 text-xs" onClick={() => setShowFull((v) => !v)}>
          {showFull ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
