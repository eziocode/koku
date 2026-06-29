"use client";

import { persist } from "zustand/middleware";
import { create } from "zustand";

type ActiveTimer = {
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
  startTimer: (input: Omit<ActiveTimer, "elapsedBeforePauseSec" | "pausedAt">) => void;
  pauseTimer: () => void;
  stopTimer: () => ActiveTimer | null;
};

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      activeTimer: null,
      startTimer: (input) =>
        set({
          activeTimer: {
            ...input,
            elapsedBeforePauseSec: 0,
            pausedAt: null,
          },
        }),
      pauseTimer: () =>
        set((state) => {
          if (!state.activeTimer) {
            return state;
          }

          if (state.activeTimer.pausedAt) {
            const pausedDelta = Math.max(
              0,
              Math.floor((Date.now() - new Date(state.activeTimer.pausedAt).getTime()) / 1000),
            );

            return {
              activeTimer: {
                ...state.activeTimer,
                startTime: new Date(
                  new Date(state.activeTimer.startTime).getTime() + pausedDelta * 1000,
                ).toISOString(),
                pausedAt: null,
              },
            };
          }

          const elapsed = Math.max(
            0,
            Math.floor((Date.now() - new Date(state.activeTimer.startTime).getTime()) / 1000),
          );

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
