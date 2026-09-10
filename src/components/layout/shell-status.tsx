"use client";

import Link from "next/link";
import { CloudOff, Loader2, Pause } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { kokuDb } from "@/lib/storage/db";
import { useLiveQuery } from "@/lib/storage/use-live-query";
import { getActiveTimerElapsedSec, useTimerStore } from "@/lib/stores/timer-store";
import { useSecondTick } from "@/lib/stores/use-ticker";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The running timer, shown in the shell so the clock is visible from any route.
 *
 * It subscribes to the timer the user is actually watching rather than the
 * whole store, so a tick re-renders this chip alone and leaves the page below
 * it untouched.
 */
export function ShellTimer() {
  const timer = useTimerStore((state) => state.timers.find((item) => !item.parentTimerId) ?? state.timers[0] ?? null);
  const now = useSecondTick();

  if (!timer) return null;
  const paused = Boolean(timer.pausedAt);
  // `now` is 0 during server render, which yields the timer's stored elapsed —
  // stable across hydration, and corrected on the first client tick.
  const elapsed = getActiveTimerElapsedSec(timer, now);

  return (
    <Link
      href="/log"
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1 text-sm transition-colors",
        paused
          ? "border-border bg-muted/60 text-muted-foreground hover:bg-muted"
          : "border-primary/25 bg-primary/10 text-primary-accessible hover:bg-primary/15",
      )}
      aria-label={`${paused ? "Paused" : "Running"}: ${timer.title}, ${formatDuration(elapsed)}. Open the time log.`}
    >
      {paused ? (
        <Pause className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <span className="koku-live-dot size-2 shrink-0 rounded-full bg-current" aria-hidden />
      )}
      <span className="hidden max-w-[14ch] truncate font-medium sm:block">{timer.title}</span>
      <span className="tabular-digits text-sm font-semibold">{formatDuration(elapsed)}</span>
    </Link>
  );
}

/**
 * Save and sync state for the workspace.
 *
 * Everything it reads lives in IndexedDB, so it reports the same state in every
 * tab: unsent cloud mutations, a sync paused after a restore, and note drafts
 * whose commit has not landed yet.
 */
export function ShellSaveStatus() {
  const pending = useLiveQuery(
    async () => {
      const [upserts, deletes, drafts, paused] = await Promise.all([
        kokuDb.pendingUpserts.count(),
        kokuDb.pendingDeletes.count(),
        kokuDb.noteDrafts.count(),
        kokuDb.storageMeta.get("syncPaused"),
      ]);
      return { queued: upserts + deletes, drafts, paused: Boolean(paused?.value) };
    },
    [],
  );

  if (!pending) return null;

  const warnings: string[] = [];
  if (pending.paused) warnings.push("cloud sync paused");
  if (pending.drafts) warnings.push(`${pending.drafts} ${pending.drafts === 1 ? "draft" : "drafts"} saving`);
  if (pending.queued) warnings.push(`${pending.queued} ${pending.queued === 1 ? "change" : "changes"} waiting to sync`);
  if (!warnings.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-accessible"
          aria-label={`Storage and sync warning: ${warnings.join(", ")}`}
        >
          {pending.paused || pending.queued ? (
            <CloudOff />
          ) : (
            <Loader2 className="animate-spin motion-reduce:animate-none" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Storage and sync</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Action may be needed before cloud data is current.</p>
        </div>
        <ul className="divide-y divide-border">
          {pending.paused ? (
            <li className="px-4 py-3">
              <p className="text-sm font-medium">Cloud sync paused</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Run manual sync and choose which copy to keep.
              </p>
            </li>
          ) : null}
          {pending.drafts ? (
            <li className="px-4 py-3">
              <p className="text-sm font-medium">
                {pending.drafts === 1 ? "1 note draft is saving" : `${pending.drafts} note drafts are saving`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The draft content is still being committed to browser storage.
              </p>
            </li>
          ) : null}
          {pending.queued ? (
            <li className="px-4 py-3">
              <p className="text-sm font-medium">
                {pending.queued === 1 ? "1 local change is waiting" : `${pending.queued} local changes are waiting`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                These changes are saved on this device and still need to reach the cloud.
              </p>
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
