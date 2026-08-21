"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { appendTimestampedNote } from "@/lib/stores/timer-notes";
import {
  createTimer,
  createTimerId,
  getActiveTimerElapsedSec,
  pauseTimerInPlace,
  resumePausedTimer,
} from "@/lib/stores/timer-math";
import { migratePersistedTimerState } from "@/lib/stores/timer-migrations";
import type {
  ActiveBreak,
  ActiveTimer,
  BreakCompletion,
  BreakStartInput,
  TimerStartInput,
} from "@/lib/stores/timer-types";

/* Re-exported so existing import sites (`timer.tsx`, `dashboard-client.tsx`,
   `command-palette.tsx`) keep working unchanged. The implementations live in
   sibling pure modules so they can be unit-tested without evaluating the store. */
export { getActiveTimerElapsedSec };
export type { ActiveBreak, ActiveTimer, BreakCompletion, BreakStartInput, TimerStartInput };

export type StartTimerOptions = {
  /** Set when the user has switched off `breaks.blockNewTimers`. */
  allowDuringBreak?: boolean;
};

export type FinishBreakOptions = {
  /** Mirrors the `breaks.autoResume` preference. Defaults to resuming. */
  autoResume?: boolean;
};

type TimerStore = {
  timers: ActiveTimer[];
  /** The in-progress break, if any. See the note below on why it lives here. */
  activeBreak: ActiveBreak | null;

  /**
   * `null` when refused: another timer is already running, or a break is in
   * progress and the caller did not opt out of that guard (the
   * `breaks.blockNewTimers` preference).
   */
  startTimer: (input: TimerStartInput, options?: StartTimerOptions) => ActiveTimer | null;
  startSecondaryTimer: (parentTimerId: string, input: TimerStartInput) => ActiveTimer | null;
  pauseTimer: (id: string) => void;
  /** `false` when refused — currently only because a break is in progress. */
  resumeTimer: (id: string) => boolean;
  stopTimer: (id: string) => ActiveTimer | null;

  appendNote: (id: string, text: string, at?: Date) => boolean;
  appendBreakNote: (text: string, at?: Date) => boolean;

  startBreak: (input: BreakStartInput) => ActiveBreak | null;
  extendBreak: (extraSec: number) => boolean;
  /**
   * Finalises the break and resumes what it paused. Returns the record so the
   * caller can write the TimeEntry — see the ordering note below.
   */
  finishBreak: (
    outcome: "completed" | "cancelled",
    options?: FinishBreakOptions,
  ) => BreakCompletion | null;
};

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Why `activeBreak` lives on the timer store rather than its own            │
 * │                                                                          │
 * │ Starting and ending a break mutates `timers` in the same operation (the   │
 * │ set it pauses, the set it resumes). Two separately-persisted stores could │
 * │ disagree after a crash mid-transition and there is no cross-store         │
 * │ transaction to prevent it. `resumeTimer` also has to consult break state  │
 * │ on every single call. And one persisted record means one `storage` event, │
 * │ so cross-tab sync stays a single rehydrate.                              │
 * │                                                                          │
 * │ A break is deliberately NOT an `ActiveTimer`: it has no project,          │
 * │ category, or pomodoro flag, and — critically — it must never appear in    │
 * │ `timers`, which `dashboard-client.tsx` merges into today's live work.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      timers: [],
      activeBreak: null,

      startTimer: (input, options) => {
        const { timers, activeBreak } = get();
        if (timers.length > 0) {
          return null;
        }

        if (activeBreak && !activeBreak.completedAt && !options?.allowDuringBreak) {
          return null;
        }

        const timer = createTimer(input);
        set({ timers: [timer] });
        return timer;
      },

      startSecondaryTimer: (parentTimerId, input) => {
        const parentTimer = get().timers.find((timer) => timer.id === parentTimerId);
        if (!parentTimer?.pausedAt) {
          return null;
        }

        const timer = createTimer(input, parentTimerId);
        set((state) => ({ timers: [...state.timers, timer] }));
        return timer;
      },

      pauseTimer: (id) =>
        set((state) => ({
          timers: state.timers.map((timer) => (timer.id === id ? pauseTimerInPlace(timer) : timer)),
        })),

      resumeTimer: (id) => {
        // The whole point of a break is that work is not being tracked during it.
        // Allowing a resume here would silently log break time as work.
        const { activeBreak } = get();
        if (activeBreak && !activeBreak.completedAt) {
          return false;
        }

        set((state) => ({
          timers: state.timers.map((timer) => (timer.id === id ? resumePausedTimer(timer) : timer)),
        }));
        return true;
      },

      stopTimer: (id) => {
        const timer = get().timers.find((item) => item.id === id) ?? null;
        if (!timer) {
          return null;
        }

        set((state) => ({ timers: state.timers.filter((item) => item.id !== id) }));
        return timer;
      },

      appendNote: (id, text, at = new Date()) => {
        const timer = get().timers.find((item) => item.id === id);
        if (!timer) {
          return false;
        }

        const notes = appendTimestampedNote(timer.notes, text, at);
        if (notes === timer.notes) {
          return false;
        }

        set((state) => ({
          timers: state.timers.map((item) => (item.id === id ? { ...item, notes } : item)),
        }));
        return true;
      },

      appendBreakNote: (text, at = new Date()) => {
        const { activeBreak } = get();
        if (!activeBreak) {
          return false;
        }

        const notes = appendTimestampedNote(activeBreak.notes, text, at);
        if (notes === activeBreak.notes) {
          return false;
        }

        set({ activeBreak: { ...activeBreak, notes } });
        return true;
      },

      startBreak: (input) => {
        if (get().activeBreak) {
          return null;
        }

        const now = Date.now();
        const timers = get().timers;
        const pausedTimerIds = timers.filter((timer) => !timer.pausedAt).map((timer) => timer.id);

        const activeBreak: ActiveBreak = {
          id: createTimerId(),
          label: input.label.trim() || "Break",
          startedAt: new Date(now).toISOString(),
          plannedDurationSec: Math.max(0, Math.round(input.plannedDurationSec)),
          pausedTimerIds,
          notes: input.notes ?? null,
          completedAt: null,
        };

        set({
          activeBreak,
          timers: timers.map((timer) =>
            pausedTimerIds.includes(timer.id) ? pauseTimerInPlace(timer, now) : timer,
          ),
        });

        return activeBreak;
      },

      extendBreak: (extraSec) => {
        const { activeBreak } = get();
        // Extending an open-ended break is meaningless — there is nothing to extend.
        if (!activeBreak || activeBreak.completedAt || activeBreak.plannedDurationSec <= 0) {
          return false;
        }

        set({
          activeBreak: {
            ...activeBreak,
            plannedDurationSec: activeBreak.plannedDurationSec + Math.max(0, Math.round(extraSec)),
          },
        });
        return true;
      },

      /**
       * Idempotent via `completedAt`, so two tabs racing to finalise the same
       * break cannot both succeed and write two entries.
       *
       * Returns the record rather than writing it: Dexie stays out of the store,
       * matching how `stopTimer` leaves persistence to its caller. Callers MUST
       * write the entry before calling this — see `break-runner`.
       */
      finishBreak: (outcome, options) => {
        const { activeBreak, timers } = get();
        if (!activeBreak || activeBreak.completedAt) {
          return null;
        }

        const now = Date.now();
        const endedAt = new Date(now).toISOString();
        const autoResume = options?.autoResume ?? true;
        const resumedTimerIds = autoResume
          ? activeBreak.pausedTimerIds.filter((id) =>
              timers.some((timer) => timer.id === id && timer.pausedAt),
            )
          : [];

        set({
          activeBreak: null,
          timers: timers.map((timer) =>
            resumedTimerIds.includes(timer.id) ? resumePausedTimer(timer, now) : timer,
          ),
        });

        return {
          breakRecord: { ...activeBreak, completedAt: endedAt },
          endedAt,
          resumedTimerIds,
          outcome,
        };
      },
    }),
    {
      // Must not change: this is where existing users' in-flight timers live.
      name: "koku-active-timer",
      version: 2,
      migrate: migratePersistedTimerState,
      partialize: (state) => ({ timers: state.timers, activeBreak: state.activeBreak }),
    },
  ),
);
