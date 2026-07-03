"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActiveTimer = {
  id: string;
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  tags: string[];
  notes?: string | null;
  startTime: string;
  elapsedBeforePauseSec: number;
  pausedAt?: string | null;
  pomodoroMode: boolean;
  parentTimerId?: string | null;
};

export type TimerStartInput = {
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  tags?: string[];
  notes?: string | null;
  startTime: string;
  pomodoroMode: boolean;
};

type TimerStore = {
  timers: ActiveTimer[];
  startTimer: (input: TimerStartInput) => ActiveTimer | null;
  startSecondaryTimer: (parentTimerId: string, input: TimerStartInput) => ActiveTimer | null;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  stopTimer: (id: string) => ActiveTimer | null;
};

type LegacyActiveTimer = Omit<ActiveTimer, "id" | "parentTimerId">;

function parseTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function createTimerId() {
  return globalThis.crypto?.randomUUID?.() ?? `timer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" || value === null ? value : null;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeStoredTimer(value: unknown): ActiveTimer | null {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.startTime !== "string") {
    return null;
  }

  return {
    id: typeof value.id === "string" ? value.id : createTimerId(),
    title: value.title,
    projectId: asNullableString(value.projectId),
    categoryId: asNullableString(value.categoryId),
    tags: Array.isArray(value.tags) ? (value.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    notes: asNullableString(value.notes),
    startTime: value.startTime,
    elapsedBeforePauseSec: typeof value.elapsedBeforePauseSec === "number" ? value.elapsedBeforePauseSec : 0,
    pausedAt: asNullableString(value.pausedAt),
    pomodoroMode: typeof value.pomodoroMode === "boolean" ? value.pomodoroMode : false,
    parentTimerId: asOptionalString(value.parentTimerId),
  };
}

function migratePersistedTimers(persistedState: unknown): Pick<TimerStore, "timers"> {
  if (!isRecord(persistedState)) {
    return { timers: [] };
  }

  if (Array.isArray(persistedState.timers)) {
    return { timers: persistedState.timers.map(normalizeStoredTimer).filter((timer) => timer !== null) };
  }

  const legacyTimer = normalizeStoredTimer(persistedState.activeTimer);
  return { timers: legacyTimer ? [legacyTimer] : [] };
}

export function getActiveTimerElapsedSec(timer: ActiveTimer | LegacyActiveTimer, now = Date.now()) {
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

function createTimer(input: TimerStartInput, parentTimerId?: string | null): ActiveTimer {
  return {
    ...input,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    id: createTimerId(),
    elapsedBeforePauseSec: 0,
    pausedAt: null,
    parentTimerId: parentTimerId ?? null,
  };
}

function resumePausedTimer(timer: ActiveTimer): ActiveTimer {
  if (!timer.pausedAt) {
    return timer;
  }

  const pausedAtMs = parseTimestamp(timer.pausedAt);
  const pausedDelta = pausedAtMs === null ? 0 : Math.max(0, Math.floor((Date.now() - pausedAtMs) / 1000));
  const startMs = parseTimestamp(timer.startTime) ?? Date.now();

  return {
    ...timer,
    startTime: new Date(startMs + pausedDelta * 1000).toISOString(),
    pausedAt: null,
  };
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      timers: [],
      startTimer: (input) => {
        if (get().timers.length > 0) {
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
          timers: state.timers.map((timer) => {
            if (timer.id !== id || timer.pausedAt) {
              return timer;
            }

            return {
              ...timer,
              elapsedBeforePauseSec: getActiveTimerElapsedSec(timer),
              pausedAt: new Date().toISOString(),
            };
          }),
        })),
      resumeTimer: (id) =>
        set((state) => ({
          timers: state.timers.map((timer) => (timer.id === id ? resumePausedTimer(timer) : timer)),
        })),
      stopTimer: (id) => {
        const timer = get().timers.find((item) => item.id === id) ?? null;
        if (!timer) {
          return null;
        }

        set((state) => ({ timers: state.timers.filter((item) => item.id !== id) }));
        return timer;
      },
    }),
    {
      name: "koku-active-timer",
      version: 1,
      migrate: migratePersistedTimers,
      partialize: (state) => ({ timers: state.timers }),
    },
  ),
);
