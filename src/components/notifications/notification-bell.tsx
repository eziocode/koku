"use client";

import { formatDistanceToNow } from "date-fns";
import { Bell, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotificationLog } from "@/lib/storage/hooks/use-notification-log";
import { cn } from "@/lib/utils";

/**
 * Bell icon in the topbar collecting every notification koku has actually
 * shown — see `recordNotificationHistory` in `lib/notifications/log.ts`,
 * called from `showKokuNotificationDetailed`. Unread rows are highlighted
 * while the popover is open and clear once it closes, so closing it is what
 * acknowledges them — no separate "mark read" step to hunt for.
 */
export function NotificationBell() {
  const { entries, unreadCount, markAllRead, remove, clearAll } = useNotificationLog();

  return (
    <Popover onOpenChange={(open) => { if (!open) void markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell />
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {entries.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={() => void clearAll()}
            >
              Clear all
            </Button>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing yet. Check-ins, breaks, and end-of-day prompts will collect here.
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn("flex items-start gap-2 px-4 py-3", !entry.readAt && "bg-muted/40")}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                  {entry.body ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.body}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove notification: ${entry.title}`}
                  onClick={() => void remove(entry.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
