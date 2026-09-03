/**
 * Shared timer/break types.
 *
 * These live apart from `timer-store.ts` so the pure helpers in `timer-math.ts`
 * and `timer-migrations.ts` can be imported by unit tests without evaluating
 * `create(persist(...))` at module scope.
 */

export type ActiveTimer = {
  id: string;
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  /** The task this session's time accumulates against, if any. */
  taskId?: string | null;
  tags: string[];
  notes?: string | null;
  /**
   * ISO. Shifted forward by the paused delta on resume, so elapsed excludes
   * pauses. Internal to the elapsed-time math — never use this for display, for
   * recording a work run, or for the entry eventually written to storage; use
   * `originalStartTime` for display and `runStartedAt` for the current run.
   */
  startTime: string;
  /** ISO. The real clock-in time, set once at creation and never mutated. */
  originalStartTime: string;
  /**
   * ISO. Real wall-clock start of the currently open run — unlike `startTime`
   * this is never shifted, so a recorded run lands where the work actually
   * happened. Optional: absent on timers persisted before this field existed
   * or adopted from the cloud, where it falls back to `startTime`.
   */
  runStartedAt?: string | null;
  elapsedBeforePauseSec: number;
  pausedAt?: string | null;
  /** Closed active stretches so far (real wall-clock start/end pairs), most
   *  recent last. The current (still-open) stretch is `runStartedAt` onward. */
  segments: { startAt: string; endAt: string }[];
  pomodoroMode: boolean;
  /** Set on secondary ("pause") timers, pointing at the primary they hang off. */
  parentTimerId?: string | null;
  /**
   * Whole seconds the user meant to work for, or absent for open ended.
   *
   * Advisory only: elapsed time is still derived from the timestamps above and
   * the timer never self-stops, so a due moment missed while the tab was frozen
   * can never truncate real work. Local only, and deliberately not carried by
   * `live-state-sync.ts` — a timer adopted from another device shows as open
   * ended, the same tradeoff already documented there for `segments` and
   * `runStartedAt`. Syncing it would need a `planned_duration_sec` column plus
   * the three touch points in `api/live-sync/route.ts`.
   */
  plannedDurationSec?: number;
  /** Cloud live-state revision. Absent for timers created before cloud sync. */
  revision?: number;
  updatedAt?: string;
};

export type TimerStartInput = {
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  taskId?: string | null;
  tags?: string[];
  notes?: string | null;
  startTime: string;
  pomodoroMode: boolean;
  /** See `ActiveTimer.plannedDurationSec`. Omit for an open-ended timer. */
  plannedDurationSec?: number;
};

/** The pre-multi-timer persisted shape, still handled by the migration. */
export type LegacyActiveTimer = Omit<ActiveTimer, "id" | "parentTimerId">;

/**
 * An in-progress break.
 *
 * Deliberately NOT modelled as an `ActiveTimer`: a break has no project,
 * category, or pomodoro flag, it has a planned duration and a set of timers it
 * paused, and — most importantly — it must never be counted by the code that
 * consumes `timers`. `dashboard-client.tsx` merges active timers into today's
 * live work, and a break appearing there would be logged as work.
 */
export type ActiveBreak = {
  id: string;
  /** "Break" by default; user-editable ("Lunch", "Walk"). */
  label: string;
  startedAt: string;
  /** 0 means open-ended: counts up, never self-completes. */
  plannedDurationSec: number;
  /** Exactly the timers this break paused, so completion resumes only those. */
  pausedTimerIds: string[];
  notes?: string | null;
  /** Set once finished. Guards against two tabs each completing the same break. */
  completedAt?: string | null;
  revision?: number;
  updatedAt?: string;
  /**
   * Set only when this break was started from a configured quick action
   * (Settings → Notifications → Quick actions). When present, the entry
   * written on completion carries this project/category and is tagged with
   * `tag` instead of the generic break tag — the plain `BreakButton` flow
   * never sets these.
   */
  projectId?: string | null;
  categoryId?: string | null;
  tag?: string | null;
  /** The quick action's configured default note, if any. Distinct from
   *  `notes` (what the user typed while it was running) — both are kept and
   *  joined when the entry is logged. */
  description?: string | null;
};

export type BreakStartInput = {
  label: string;
  plannedDurationSec: number;
  notes?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  tag?: string | null;
  description?: string | null;
};

export type BreakCompletion = {
  breakRecord: ActiveBreak;
  endedAt: string;
  resumedTimerIds: string[];
  outcome: "completed" | "cancelled";
};
