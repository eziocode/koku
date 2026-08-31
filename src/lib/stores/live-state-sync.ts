"use client";

import { kokuDb, type PendingLiveMutation } from "@/lib/storage/db";
import { getAuthUser } from "@/lib/sync/sync-engine";
import { isBreakFinished } from "@/lib/stores/finished-breaks";
import { useTimerStore } from "@/lib/stores/timer-store";
import type { ActiveBreak, ActiveTimer } from "@/lib/stores/timer-types";

export const LIVE_SYNC_POLL_MS = 5_000;

type LiveTimerRecord = {
  id: string; title: string; projectId: string | null; categoryId: string | null;
  tags: string[]; notes: string | null; startAt: string; elapsedBeforePauseSec: number;
  pausedAt: string | null; pomodoroMode: boolean; parentTimerId: string | null;
  revision: number; updatedAt: string; deletedAt: string | null;
};
type LiveBreakRecord = {
  id: string; label: string; startedAt: string; plannedDurationSec: number;
  pausedTimerIds: string[]; notes: string | null; revision: number; updatedAt: string; deletedAt: string | null;
  projectId: string | null; categoryId: string | null; tag: string | null; description: string | null;
};
type Tombstone = { id: string; revision: number; deletedAt: string; updatedAt: string };
type LivePayload = { timers?: LiveTimerRecord[]; breaks?: LiveBreakRecord[] };

let applyingCloud = false;
let flushing: Promise<void> | null = null;

function timerRecord(timer: ActiveTimer, updatedAt = new Date().toISOString()): LiveTimerRecord {
  return { id: timer.id, title: timer.title, projectId: timer.projectId ?? null, categoryId: timer.categoryId ?? null,
    tags: timer.tags, notes: timer.notes ?? null, startAt: timer.startTime, elapsedBeforePauseSec: timer.elapsedBeforePauseSec,
    pausedAt: timer.pausedAt ?? null, pomodoroMode: timer.pomodoroMode, parentTimerId: timer.parentTimerId ?? null,
    revision: timer.revision ?? 0, updatedAt, deletedAt: null };
}
function breakRecord(value: ActiveBreak, updatedAt = new Date().toISOString()): LiveBreakRecord {
  return { id: value.id, label: value.label, startedAt: value.startedAt, plannedDurationSec: value.plannedDurationSec,
    pausedTimerIds: value.pausedTimerIds, notes: value.notes ?? null, revision: value.revision ?? 0, updatedAt, deletedAt: null,
    projectId: value.projectId ?? null, categoryId: value.categoryId ?? null, tag: value.tag ?? null, description: value.description ?? null };
}
function cloudTimer(value: LiveTimerRecord): ActiveTimer {
  return { id: value.id, title: value.title, projectId: value.projectId, categoryId: value.categoryId, tags: value.tags,
    notes: value.notes, startTime: value.startAt, elapsedBeforePauseSec: value.elapsedBeforePauseSec, pausedAt: value.pausedAt,
    pomodoroMode: value.pomodoroMode, parentTimerId: value.parentTimerId, revision: value.revision, updatedAt: value.updatedAt };
}
function cloudBreak(value: LiveBreakRecord): ActiveBreak {
  return { id: value.id, label: value.label, startedAt: value.startedAt, plannedDurationSec: value.plannedDurationSec,
    pausedTimerIds: value.pausedTimerIds, notes: value.notes, completedAt: null, revision: value.revision, updatedAt: value.updatedAt,
    projectId: value.projectId, categoryId: value.categoryId, tag: value.tag, description: value.description };
}

/**
 * Writes the server's authoritative revision for one timer or break back onto
 * the live Zustand state, after a push response confirms it (accepted or
 * conflicting — either way, it's the server's current truth).
 *
 * Without this, `startBreak`/`createTimer` never stamp a revision at all, so
 * every push after the first for that entity keeps sending `revision: 0`
 * while the server has long since moved past it — a conflict on every single
 * edit, not just the first. Guarded by `applyingCloud` so this doesn't loop
 * back through `startLiveStateSync`'s subscribe and queue a redundant push:
 * `push` already knows the queued mutation is caught up, via the rebase in
 * its own caller.
 */
function applyRevision(kind: "timer" | "break", id: string, revision: number): void {
  applyingCloud = true;
  const state = useTimerStore.getState();
  if (kind === "timer") {
    useTimerStore.setState({
      timers: state.timers.map((timer) => (timer.id === id ? { ...timer, revision } : timer)),
    });
  } else if (state.activeBreak?.id === id) {
    useTimerStore.setState({ activeBreak: { ...state.activeBreak, revision } });
  }
  applyingCloud = false;
}

async function queue(id: string, kind: PendingLiveMutation["kind"], record: unknown) {
  await kokuDb.pendingLiveMutations.put({ id, kind, record, updatedAt: new Date().toISOString() });
}

async function queueDiff(previous: { timers: ActiveTimer[]; activeBreak: ActiveBreak | null }, next: { timers: ActiveTimer[]; activeBreak: ActiveBreak | null }) {
  const before = new Map(previous.timers.map((timer) => [timer.id, timer]));
  const after = new Map(next.timers.map((timer) => [timer.id, timer]));
  for (const timer of after.values()) await queue(`timer:${timer.id}`, "timer", timerRecord(timer));
  for (const [id, timer] of before) if (!after.has(id)) {
    const now = new Date().toISOString();
    await queue(`timer:${id}`, "timer-tombstone", { id, revision: timer.revision ?? 0, deletedAt: now, updatedAt: now } satisfies Tombstone);
  }
  if (next.activeBreak) await queue(`break:${next.activeBreak.id}`, "break", breakRecord(next.activeBreak));
  if (previous.activeBreak && !next.activeBreak) {
    const now = new Date().toISOString();
    await queue(`break:${previous.activeBreak.id}`, "break-tombstone", { id: previous.activeBreak.id, revision: previous.activeBreak.revision ?? 0, deletedAt: now, updatedAt: now } satisfies Tombstone);
  }
}

/**
 * Matches a pushed mutation to the row the server returned for its id, so the
 * caller can tell a genuine conflict apart from an ordinary accepted write.
 * The route always returns a full row for both cases (`apply()` in
 * `route.ts`), just at different revisions — see the `expectedRevision`
 * comparison in `push` for how that distinction is drawn.
 */
function findReturnedRow(mutations: unknown[], id: string): { revision: number } | undefined {
  return (mutations as Array<{ id: string; revision: number }>).find((row) => row.id === id);
}

async function push(mutations: PendingLiveMutation[]) {
  // Skip the request entirely while signed out, same as the rest of sync
  // (see `getAuthUser`'s docstring): without this, every timer/break edit
  // fires a POST that can only ever 401, spamming devtools and the server's
  // NO_ACCESS log for a mutation that's already safely queued locally and
  // will flush the moment a session exists.
  if (!(await getAuthUser())) return;
  const body = {
    timers: mutations.filter((x) => x.kind === "timer").map((x) => x.record),
    breaks: mutations.filter((x) => x.kind === "break").map((x) => x.record),
    timerTombstones: mutations.filter((x) => x.kind === "timer-tombstone").map((x) => x.record),
    breakTombstones: mutations.filter((x) => x.kind === "break-tombstone").map((x) => x.record),
  };
  const response = await fetch("/api/live-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.status === 401) return;
  const result = await response.json() as { timers?: unknown[]; breaks?: unknown[] };
  if (!response.ok && response.status !== 409) throw new Error("Live sync failed");
  const returned = [...(result.timers ?? []), ...(result.breaks ?? [])];
  for (const mutation of mutations) {
    // Another gesture may have replaced this queue item while request was in
    // flight. Keep newer local intent; it still expects same server revision.
    const current = await kokuDb.pendingLiveMutations.get(mutation.id);
    if (current?.updatedAt !== mutation.updatedAt) continue;

    const record = mutation.record as { id: string; revision?: number };
    const expectedRevision = (record.revision ?? 0) + 1;
    const row = findReturnedRow(returned, record.id);

    // Stamp the server's authoritative revision back onto the live entity —
    // whether accepted or conflicting, it's the truth this client's next edit
    // needs to build on. Not for a tombstone: there's no live entity left to
    // stamp once a break/timer has been torn down locally.
    if (row && (mutation.kind === "timer" || mutation.kind === "break")) {
      applyRevision(mutation.kind, record.id, row.revision);
    }

    if (!row || row.revision === expectedRevision) {
      // Either this id wasn't part of the response (nothing to reconcile) or
      // the server accepted it at the revision we expected — done.
      await kokuDb.pendingLiveMutations.delete(mutation.id);
      continue;
    }

    // Conflict: the server's revision doesn't match what an accepted write
    // would have produced. Previously this branch deleted the mutation
    // anyway — discarding local intent (most dangerously a break's own
    // tombstone) and letting the next pull resurrect the stale cloud state.
    // Instead, keep it queued but re-based onto the server's current
    // revision, so the next flush's expected-revision check passes.
    await kokuDb.pendingLiveMutations.put({
      ...current,
      record: { ...record, revision: row.revision },
      updatedAt: new Date().toISOString(),
    });
  }
  // Response contains only changed rows, never a full snapshot. Pull before
  // replacing Zustand state so a successful timer write cannot hide siblings.
  if (await kokuDb.pendingLiveMutations.count() === 0) await pullLiveState({ skipPendingFlush: true });
}

export function flushLiveState(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!navigator.onLine) return;
    // Drain newer gestures that arrive while an earlier optimistic write waits.
    // Bound loop so a very busy timer UI yields back to the next mutation/poll.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const mutations = await kokuDb.pendingLiveMutations.toArray();
      if (!mutations.length) break;
      await push(mutations);
    }
  })().catch(() => undefined).finally(() => { flushing = null; });
  return flushing;
}

function applyCloud(payload: LivePayload) {
  const cloudTimers = (payload.timers ?? []).filter((timer) => !timer.deletedAt).map(cloudTimer);
  // A break this client already finalised (see `finished-breaks.ts`) must
  // never come back from a pull, even a live one: the cloud row has no
  // `completedAt` of its own, so a stale row — one whose delete lagged, e.g.
  // behind the tombstone-conflict retry in `push` above — reads as an
  // ordinary still-running break and would otherwise be logged again by
  // `BreakRunner`.
  const activeCloudBreak = (payload.breaks ?? []).find(
    (item) => !item.deletedAt && !isBreakFinished(item.id),
  );
  applyingCloud = true;
  useTimerStore.getState().replaceLiveStateFromCloud(cloudTimers, activeCloudBreak ? cloudBreak(activeCloudBreak) : null);
  applyingCloud = false;
}

export async function pullLiveState(options: { skipPendingFlush?: boolean } = {}): Promise<void> {
  try {
    if (!navigator.onLine) return;
    // Same reasoning as `push`: the 5s poll interval means an unauthenticated
    // tab would otherwise hit this endpoint, and log a 401 for it, forever.
    if (!(await getAuthUser())) return;
    // Local mutations must win until server acknowledges them. Otherwise an
    // OAuth restore could pull old cloud state and erase an offline timer.
    if (!options.skipPendingFlush && await kokuDb.pendingLiveMutations.count()) {
      await flushLiveState();
      if (await kokuDb.pendingLiveMutations.count()) return;
    }
    const response = await fetch("/api/live-sync", { cache: "no-store" });
    if (!response.ok) return;
    applyCloud(await response.json() as LivePayload);
  } catch {
    // Poll failure is normal offline behavior; queued mutations remain intact.
  }
}

/** Start once in root client provider. Changes upload now; visible tabs poll. */
export function startLiveStateSync(): () => void {
  let previous = useTimerStore.getState();
  const unsubscribe = useTimerStore.subscribe((next) => {
    if (applyingCloud) { previous = next; return; }
    const before = previous; previous = next;
    void queueDiff(before, next).then(flushLiveState);
  });
  const poll = () => { if (document.visibilityState === "visible") void pullLiveState(); };
  poll();
  const interval = window.setInterval(poll, LIVE_SYNC_POLL_MS);
  window.addEventListener("online", flushLiveState);
  document.addEventListener("visibilitychange", poll);
  return () => { unsubscribe(); window.clearInterval(interval); window.removeEventListener("online", flushLiveState); document.removeEventListener("visibilitychange", poll); };
}
