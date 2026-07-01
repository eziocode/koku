"use client";

import { persist } from "zustand/middleware";
import { create } from "zustand";

export type ActiveTimer = {
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  startTime: string;
  elapsedBeforePauseSec: number;
  pausedAt?: string | null;
  pomodoroMode: boolean;
};

type TimerStore = {
  activeTimer: ActiveTimer | null;
  startTimer: (input: Omit<ActiveTimer, "elapsedBeforePauseSec" | "pausedAt">) => boolean;
  pauseTimer: () => void;
  stopTimer: () => ActiveTimer | null;
};

function parseTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getActiveTimerElapsedSec(timer: ActiveTimer, now = Date.now()) {
  if (timer.pausedAt) {
    return Math.max(0, timer.elapsedBeforePauseSec);
  }

  const startMs = parseTimestamp(timer.startTime);
  if (startMs === null) {
    return Math.max(0, timer.elapsedBeforePauseSec);
  }

  return Math.max(
    timer.elapsedBeforePauseSec,
    Math.floor((now - startMs) / 1000),
  );
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      activeTimer: null,
      startTimer: (input) => {
        if (get().activeTimer) {
          return false;
        }

        set({
          activeTimer: {
            ...input,
            elapsedBeforePauseSec: 0,
            pausedAt: null,
          },
        });
        return true;
      },
      pauseTimer: () =>
        set((state) => {
          if (!state.activeTimer) {
            return state;
          }

          if (state.activeTimer.pausedAt) {
            const pausedAtMs = parseTimestamp(state.activeTimer.pausedAt);
            const pausedDelta = pausedAtMs === null ? 0 : Math.max(0, Math.floor((Date.now() - pausedAtMs) / 1000));
            const startMs = parseTimestamp(state.activeTimer.startTime) ?? Date.now();

            return {
              activeTimer: {
                ...state.activeTimer,
                startTime: new Date(startMs + pausedDelta * 1000).toISOString(),
                pausedAt: null,
              },
            };
          }

          const elapsed = getActiveTimerElapsedSec(state.activeTimer);

          return {
            activeTimer: {
              ...state.activeTimer,
              elapsedBeforePauseSec: elapsed,
              pausedAt: new Date().toISOString(),
            },
          };
        }),
      stopTimer: () => {
        const timer = get().activeTimer;
        set({ activeTimer: null });
        return timer;
      },
    }),
    {
      name: "koku-active-timer",
      partialize: (state) => ({ activeTimer: state.activeTimer }),
    },
  ),
);
