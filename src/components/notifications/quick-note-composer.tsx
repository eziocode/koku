"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { persistQuickNote, type QuickNoteOrigin } from "@/lib/notes";
import { QUICK_NOTE_TAG } from "@/lib/notifications/settings";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { useTimerStore } from "@/lib/stores/timer-store";
import { createTimeEntry } from "@/lib/time-tracking/time-entries";
import { formatDuration } from "@/lib/utils";

/**
 * What a quick note will attach to.
 *
 * Derived by the caller so this component stays reusable — the mini player
 * renders the same composer with a target it computes itself.
 */
export type QuickNoteTarget =
  | { kind: "timer"; timerId: string; title: string; elapsedSec: number }
  | { kind: "break"; label: string }
  | { kind: "standalone" };

interface QuickNoteComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: QuickNoteTarget;
  onSaved?: (target: QuickNoteTarget) => void;
}

/** Maps the composer's target onto the shape the notes writer wants. */
function toOrigin(target: QuickNoteTarget): QuickNoteOrigin {
  if (target.kind === "timer") {
    return { kind: "timer", label: target.title, elapsedSec: target.elapsedSec };
  }

  if (target.kind === "break") {
    return { kind: "break", label: target.label, elapsedSec: null };
  }

  return { kind: "standalone", label: null, elapsedSec: null };
}

function describeTarget(target: QuickNoteTarget): string {
  if (target.kind === "timer") {
    return `Appends to “${target.title}” · ${formatDuration(target.elapsedSec)}`;
  }

  if (target.kind === "break") {
    return `Appends to your ${target.label.toLowerCase()}`;
  }

  return "No timer running — saves as a standalone entry at the current time";
}

/**
 * A single-field note composer, opened from a check-in notification.
 *
 * Web notifications cannot contain a text input — the Notifications API offers
 * action buttons only — so "quick reply" means the notification focuses koku and
 * this appears: one field, Enter to save, Escape to dismiss. It states what it
 * will attach to, so the behaviour is never a surprise.
 */
export function QuickNoteComposer({ open, onOpenChange, target, onSaved }: QuickNoteComposerProps) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const appendNote = useTimerStore((state) => state.appendNote);
  const appendBreakNote = useTimerStore((state) => state.appendBreakNote);
  const { value: timeFormat } = useTypedSetting("timeFormat");

  // Cleared on close rather than on open, so the field is always empty next time
  // without needing an effect to reset it.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setText("");
    }

    onOpenChange(next);
  }

  async function save() {
    const trimmed = text.trim();
    if (!trimmed || saving) {
      return;
    }

    setSaving(true);

    try {
      if (target.kind === "timer") {
        appendNote(target.timerId, trimmed, new Date(), timeFormat);
        toast.success(`Note added to “${target.title}” and your notes.`);
      } else if (target.kind === "break") {
        appendBreakNote(trimmed, new Date(), timeFormat);
        toast.success("Note added to your break and your notes.");
      } else {
        // Nothing is running, so the note becomes a zero-duration entry. Nothing
        // is lost, it lands on /log at the right time, and because
        // `deriveStatus` reads `endAt && durationSec === 0` as "pending" it
        // shows as recorded-but-not-worked and contributes no hours to any total.
        const now = new Date().toISOString();
        await createTimeEntry({
          title: trimmed.length > 60 ? `${trimmed.slice(0, 59)}…` : trimmed,
          startAt: now,
          endAt: now,
          durationSec: 0,
          tags: [QUICK_NOTE_TAG],
          notes: trimmed,
        });
        toast.success("Note saved to your log and your notes.");
      }

      // Also lands in the notes section, tagged and stamped, so a thought
      // captured in one line has somewhere to grow. Failing this must not lose
      // the note the user already typed, so the primary write above stays
      // authoritative and this is reported separately.
      try {
        await persistQuickNote(trimmed, toOrigin(target), formatDuration, new Date(), timeFormat);
      } catch {
        toast.error("Saved, but couldn’t copy it into your notes.");
      }

      onSaved?.(target);
      handleOpenChange(false);
    } catch {
      toast.error("Couldn’t save that note. Try again?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick note</DialogTitle>
          <DialogDescription>{describeTarget(target)}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves. Not wrapped in a <form>, so there is no chance of a
            // stray navigation from a document opened by the service worker.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void save();
            }
          }}
          placeholder="What just happened?"
          aria-label="Quick note text"
          className="min-h-11"
          disabled={saving}
        />
        <p className="text-xs text-muted-foreground">
          Also saved to Notes, tagged{" "}
          <span className="rounded bg-muted px-1 font-medium">Quicknote</span>, with the date and
          time filled in for you.
        </p>
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border border-border px-1">Enter</kbd> to save ·{" "}
          <kbd className="rounded border border-border px-1">Esc</kbd> to dismiss
        </p>
      </DialogContent>
    </Dialog>
  );
}
