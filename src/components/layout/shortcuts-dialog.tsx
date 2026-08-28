"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortcut, SHORTCUTS, type ShortcutGroup } from "@/lib/ui/shortcuts";

const GROUP_ORDER: ShortcutGroup[] = ["General", "Navigation", "Tracking", "Notifications"];

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The `?` cheatsheet — every binding in `lib/ui/shortcuts.ts`, grouped and
 * rendered as `<kbd>` runs. Radix `Dialog` gives focus trapping, restore on
 * close, and Escape-to-close for free.
 */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="shortcuts-dialog-description">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription id="shortcuts-dialog-description">
            Bare keys and Shift-key combos only. Nothing here overrides a browser or OS shortcut.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {GROUP_ORDER.map((group) => {
            const items = SHORTCUTS.filter((shortcut) => shortcut.group === group);
            if (items.length === 0) {
              return null;
            }

            return (
              <div key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {items.map((shortcut) => {
                    const display = formatShortcut(shortcut);
                    return (
                      <li
                        key={shortcut.id}
                        className="flex items-center justify-between gap-4 text-sm"
                        aria-label={`Press ${display} to ${shortcut.label.toLowerCase()}`}
                      >
                        <span className="text-foreground">{shortcut.label}</span>
                        <kbd
                          aria-hidden="true"
                          className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
                        >
                          {display}
                        </kbd>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
