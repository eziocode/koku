/**
 * Single-emitter election across koku tabs.
 *
 * Three tabs open must not mean three copies of every check-in. One tab is
 * elected leader and is the only one that fires notifications, writes the
 * schedule, or finalises a completed break.
 *
 * Worth being clear about the layering: the *guarantee* against duplicates is
 * the stable notification `tag` — a second notification with the same tag
 * replaces the first rather than stacking. Election is the optimisation that
 * stops the duplicate work happening at all.
 */

export type LeaderStatus = "idle" | "leader" | "follower";

export const LEADER_LOCK_NAME = "koku-notify-leader";

/** Not named `*_KEY`: see the note in `runtime.ts` about the security audit. */
export const LEADER_LEASE_STORE = "koku-notify-leader-lease";

export const HEARTBEAT_INTERVAL_MS = 3_000;
export const HEARTBEAT_STALE_MS = 8_000;

export interface LeaseRecord {
  ownerId: string;
  expiresAt: number;
}

export interface LeaderHandle {
  status: () => LeaderStatus;
  subscribe: (listener: () => void) => () => void;
  release: () => void;
}

export function createTabId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/* ─── Pure fallback arbitration (unit-tested) ─────────────────────────────── */

export function parseLease(raw: string | null): LeaseRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const { ownerId, expiresAt } = parsed as Record<string, unknown>;
    if (typeof ownerId !== "string" || typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
      return null;
    }

    return { ownerId, expiresAt };
  } catch {
    return null;
  }
}

export function isLeaseStale(lease: LeaseRecord | null, now: number): boolean {
  return lease === null || lease.expiresAt <= now;
}

/**
 * Decides who owns the lease.
 *
 * A stale lease is up for grabs. Otherwise the recorded owner keeps it, except
 * that ties are broken by the lexicographically lowest tab id so two tabs
 * claiming in the same instant converge on the same answer instead of
 * oscillating.
 */
export function resolveFallbackOwner(
  selfId: string,
  lease: LeaseRecord | null,
  now: number,
): LeaderStatus {
  if (isLeaseStale(lease, now)) {
    return "leader";
  }

  if (lease!.ownerId === selfId) {
    return "leader";
  }

  return selfId < lease!.ownerId ? "leader" : "follower";
}

/* ─── Election ────────────────────────────────────────────────────────────── */

/**
 * Elects this tab, preferring Web Locks.
 *
 * Web Locks is the right primitive: the lock is released automatically when the
 * tab closes or crashes, which is exactly the property a heartbeat has to
 * simulate, and it is available in every browser koku runs in. The queued
 * followers are promoted by the browser itself the moment the leader goes away.
 *
 * The localStorage lease is a genuine fallback rather than the main path. Its
 * worst case is a brief window where two tabs both believe they lead — contained
 * by the notification tag, and self-healing on the next heartbeat.
 */
export interface ElectLeaderOptions {
  /** Web Locks name. Distinct scopes (notifications, mini player) must differ. */
  lockName?: string;
  /** localStorage lease key for the no-Web-Locks fallback. Must match the scope. */
  leaseStore?: string;
  tabId?: string;
}

export function electLeader(options: ElectLeaderOptions = {}): LeaderHandle {
  const lockName = options.lockName ?? LEADER_LOCK_NAME;
  const leaseStore = options.leaseStore ?? LEADER_LEASE_STORE;
  const tabId = options.tabId ?? createTabId();
  const listeners = new Set<() => void>();
  let status: LeaderStatus = "idle";
  let released = false;
  let releaseLock: (() => void) | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;

  function setStatus(next: LeaderStatus) {
    if (status === next) {
      return;
    }

    status = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function writeLease(now: number) {
    try {
      localStorage.setItem(
        leaseStore,
        JSON.stringify({ ownerId: tabId, expiresAt: now + HEARTBEAT_STALE_MS }),
      );
    } catch {
      /* storage unavailable — fall back to acting as leader in this tab only */
    }
  }

  function heartbeat() {
    if (released) {
      return;
    }

    const now = Date.now();
    let lease: LeaseRecord | null = null;
    try {
      lease = parseLease(localStorage.getItem(leaseStore));
    } catch {
      lease = null;
    }

    const resolved = resolveFallbackOwner(tabId, lease, now);
    if (resolved === "leader") {
      writeLease(now);
    }

    setStatus(resolved);
  }

  function startFallback() {
    heartbeat();
    heartbeatId = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  }

  if (typeof navigator !== "undefined" && "locks" in navigator) {
    void navigator.locks
      .request(lockName, { mode: "exclusive" }, () => {
        if (released) {
          return Promise.resolve();
        }

        setStatus("leader");
        // Held un-resolved for the tab's lifetime; resolving it hands leadership
        // to the next queued tab.
        return new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
      })
      .catch(() => {
        // Lock unavailable for an unexpected reason — degrade rather than go silent.
        if (!released) {
          startFallback();
        }
      });

    // Until the lock callback runs we are a follower, not a leader: never assume
    // leadership optimistically or two tabs would both fire on startup.
    setStatus("follower");
  } else if (typeof localStorage !== "undefined") {
    startFallback();
  } else {
    // No coordination primitive at all (SSR, or storage fully blocked). A single
    // tab acting alone is the only sensible reading.
    setStatus("leader");
  }

  return {
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    release: () => {
      if (released) {
        return;
      }

      released = true;

      if (heartbeatId !== null) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }

      if (status === "leader") {
        try {
          const lease = parseLease(localStorage.getItem(leaseStore));
          if (lease?.ownerId === tabId) {
            localStorage.removeItem(leaseStore);
          }
        } catch {
          /* nothing to release */
        }
      }

      releaseLock?.();
      releaseLock = null;
      setStatus("idle");
    },
  };
}
