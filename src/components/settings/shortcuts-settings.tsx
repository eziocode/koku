"use client";

import { formatShortcut, SHORTCUTS, type ShortcutGroup } from "@/lib/ui/shortcuts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const GROUP_ORDER: ShortcutGroup[] = ["General", "Navigation", "Tracking", "Notifications"];
const GROUP_COPY: Record<ShortcutGroup, string> = {
  General: "Available anywhere in the app.",
  Navigation: "Press g, then the second key, within a second and a half.",
  Tracking: "Act on whatever timer or break is currently running.",
  Notifications: "Change notification state without opening a menu.",
};

/**
 * Read-only listing of every shortcut in `lib/ui/shortcuts.ts` — the same
 * source the `?` help dialog renders from, so the two can never drift.
 * Rebinding isn't offered yet; see the plan doc for why.
 */
export function ShortcutsSettings() {
  return (
    <div className="space-y-6">
      {GROUP_ORDER.map((group) => {
        const items = SHORTCUTS.filter((shortcut) => shortcut.group === group);
        if (items.length === 0) {
          return null;
        }

        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{group}</CardTitle>
              <CardDescription>{GROUP_COPY[group]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-4"
                >
                  <span className="text-sm font-medium">{shortcut.label}</span>
                  <kbd className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {formatShortcut(shortcut)}
                  </kbd>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
