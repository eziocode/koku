"use client";

import { create } from "zustand";

/**
 * Fields a "clone this" action or a routine suggestion wants to hand to
 * `<Timer />`. Notes are deliberately excluded — they describe a specific
 * session, not the recurring shape of the work.
 */
export interface TimerDraft {
  title: string;
  projectId: string | null;
  categoryId: string | null;
  taskId: string | null;
  tags: string[];
}

type TimerDraftStore = {
  draft: TimerDraft | null;
  /** Bumped on every request so cloning the same entry twice still re-fires the effect that applies it. */
  nonce: number;
  /**
   * Set by `<Timer />` while it's mounted. The log page swaps `<Timer />` for
   * a placeholder card on non-today dates, so a draft requested there has
   * nowhere to land unless the caller checks this first.
   */
  timerMounted: boolean;
  requestDraft: (draft: TimerDraft) => void;
  consumeDraft: () => void;
  setTimerMounted: (mounted: boolean) => void;
};

/**
 * Not persisted: a draft is a one-shot handoff between "clone this entry" (or
 * a routine suggestion) and the timer form. Persisting it would resurrect a
 * stale prefill on a later, unrelated session.
 */
export const useTimerDraftStore = create<TimerDraftStore>()((set) => ({
  draft: null,
  nonce: 0,
  timerMounted: false,
  requestDraft: (draft) => set((state) => ({ draft, nonce: state.nonce + 1 })),
  consumeDraft: () => set({ draft: null }),
  setTimerMounted: (mounted) => set({ timerMounted: mounted }),
}));
