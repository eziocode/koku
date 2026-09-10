"use client";

import Link from "next/link";
import { CloudOff, Loader2, Pause, ShieldCheck } from "lucide-react";

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

  if (pending.paused) {
    return (
      <StatusPill tone="warn" icon={<CloudOff className="size-3.5" aria-hidden />}>
        Sync paused
      </StatusPill>
    );
  }

  if (pending.drafts) {
    return (
      <StatusPill tone="warn" icon={<Loader2 className="size-3.5 animate-spin" aria-hidden />}>
        {pending.drafts === 1 ? "1 draft saving" : `${pending.drafts} drafts saving`}
      </StatusPill>
    );
  }

  if (pending.queued) {
    return (
      <StatusPill tone="warn" icon={<CloudOff className="size-3.5" aria-hidden />}>
        Saved locally, {pending.queued} to send
      </StatusPill>
    );
  }

  return (
    <StatusPill tone="calm" icon={<ShieldCheck className="size-3.5" aria-hidden />}>
      Saved locally
    </StatusPill>
  );
}

function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: "calm" | "warn";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        "hidden min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs md:flex",
        tone === "warn"
          ? "border-primary/25 bg-primary/10 text-primary-accessible"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </p>
  );
}
