"use client";

import { kokuDb, type PendingLiveMutation } from "@/lib/storage/db";
import { getAuthUser } from "@/lib/sync/sync-engine";
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
  await response.json();
  if (!response.ok && response.status !== 409) throw new Error("Live sync failed");
  for (const mutation of mutations) {
    // Another gesture may have replaced this queue item while request was in
    // flight. Keep newer local intent; it still expects same server revision.
    const current = await kokuDb.pendingLiveMutations.get(mutation.id);
    if (current?.updatedAt === mutation.updatedAt) await kokuDb.pendingLiveMutations.delete(mutation.id);
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
  const activeCloudBreak = (payload.breaks ?? []).find((item) => !item.deletedAt);
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
