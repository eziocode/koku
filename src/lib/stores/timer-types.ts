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
  /** ISO. Shifted forward by the paused delta on resume, so elapsed excludes pauses. */
  startTime: string;
  elapsedBeforePauseSec: number;
  pausedAt?: string | null;
  pomodoroMode: boolean;
  /** Set on secondary ("pause") timers, pointing at the primary they hang off. */
  parentTimerId?: string | null;
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
};

export type BreakStartInput = {
  label: string;
  plannedDurationSec: number;
  notes?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  tag?: string | null;
};

export type BreakCompletion = {
  breakRecord: ActiveBreak;
  endedAt: string;
  resumedTimerIds: string[];
  outcome: "completed" | "cancelled";
};
