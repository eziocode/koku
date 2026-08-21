import type { DndMode, NotificationPreferences } from "@/lib/notifications/settings";

export type DndDurationId = "30m" | "1h" | "tomorrow" | "indefinite";

export const DND_DURATIONS: ReadonlyArray<{ id: DndDurationId; label: string }> = [
  { id: "30m", label: "For 30 minutes" },
  { id: "1h", label: "For 1 hour" },
  { id: "tomorrow", label: "Until tomorrow" },
  { id: "indefinite", label: "Until I turn it off" },
];

export interface DndState {
  active: boolean;
  /** Epoch ms when DND lapses; `null` for off or indefinite. */
  expiresAt: number | null;
  /** True when a timed DND has lapsed and the stored mode should be cleared. */
  expired: boolean;
}

/**
 * Resolves the stored DND preference against the current time.
 *
 * A lapsed `"until"` reports `{ active: false, expired: true }` so suppression
 * stops immediately without waiting for a write — the leader tab then clears the
 * stored mode lazily, which is what makes the topbar pill disappear in every tab.
 * A malformed `untilIso` is treated as lapsed rather than as forever, so a
 * corrupt value can never silence koku permanently.
 */
export function resolveDnd(
  dnd: Pick<NotificationPreferences["dnd"], "mode" | "untilIso">,
  now: number,
): DndState {
  if (dnd.mode === "off") {
    return { active: false, expiresAt: null, expired: false };
  }

  if (dnd.mode === "indefinite") {
    return { active: true, expiresAt: null, expired: false };
  }

  const expiresAt = dnd.untilIso === null ? NaN : Date.parse(dnd.untilIso);
  if (!Number.isFinite(expiresAt)) {
    return { active: false, expiresAt: null, expired: true };
  }

  return now >= expiresAt
    ? { active: false, expiresAt, expired: true }
    : { active: true, expiresAt, expired: false };
}

/**
 * The absolute expiry for a chosen duration, or `null` for indefinite.
 *
 * "Tomorrow" is computed by mutating a local `Date` rather than adding
 * 86_400_000ms, so it lands on the intended wall-clock hour across a DST
 * boundary instead of drifting by an hour.
 */
export function computeDndUntilIso(
  duration: DndDurationId,
  now: Date,
  resumeMinuteOfDay = 8 * 60,
): string | null {
  if (duration === "indefinite") {
    return null;
  }

  if (duration === "30m") {
    return new Date(now.getTime() + 30 * 60_000).toISOString();
  }

  if (duration === "1h") {
    return new Date(now.getTime() + 60 * 60_000).toISOString();
  }

  const resume = new Date(now);
  resume.setHours(Math.floor(resumeMinuteOfDay / 60), resumeMinuteOfDay % 60, 0, 0);
  if (resume.getTime() <= now.getTime()) {
    resume.setDate(resume.getDate() + 1);
  }

  return resume.toISOString();
}

export function dndModeForDuration(duration: DndDurationId): DndMode {
  return duration === "indefinite" ? "indefinite" : "until";
}

/** Compact remaining-time label for the always-visible topbar pill. */
export function formatDndRemaining(state: DndState, now: number): string {
  if (!state.active) {
    return "off";
  }

  if (state.expiresAt === null) {
    return "on";
  }

  const totalMinutes = Math.max(0, Math.ceil((state.expiresAt - now) / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
