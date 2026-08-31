import { BREAK_TAG } from "@/lib/notifications/settings";
import { markBreakFinished } from "@/lib/stores/finished-breaks";
import type { ActiveBreak } from "@/lib/stores/timer-types";
import { createTimeEntry, ensureBreakAssignments } from "@/lib/time-tracking/time-entries";

/**
 * Deterministic id for a break's logged entry, derived from the break's own
 * id rather than a fresh UUID. Two writes for the same break — a retried
 * request, a second device finalising the same synced break, an effect that
 * re-entered before its guard caught up — collapse onto one Dexie row instead
 * of creating a duplicate, and the sync push upserts by id so the same is
 * true in the cloud.
 */
function breakEntryId(breakId: string): string {
  return `break:${breakId}`;
}

/**
 * Combines a quick action's configured default note with whatever the user
 * typed while it was running. Both are optional; whitespace-only counts as
 * absent so an empty textarea never writes a blank notes field.
 */
export function composeBreakEntryNotes(
  description?: string | null,
  notes?: string | null,
): string | null {
  const head = description?.trim() ?? "";
  const tail = notes?.trim() ?? "";

  if (head && tail) {
    return `${head}\n\n${tail}`;
  }

  return head || tail || null;
}

export interface WriteBreakEntryArgs {
  endAtIso: string;
  elapsedSec: number;
  outcome: "completed" | "cancelled";
}

/**
 * The single writer for a finished break or quick action.
 *
 * Previously duplicated across `BreakCard`, `BreakRunner`, and the mini player,
 * and only one of the three read the quick-action fields — so a "Call" that
 * timed out, or was ended from the mini player, silently lost its configured
 * project, category, and tag and was logged as a generic break. Keeping one
 * writer is what stops that drift from coming back.
 *
 * Callers MUST await this before `finishBreak`, so a failed write leaves the
 * break active and retryable rather than losing the record.
 *
 * Idempotent: the entry's id is derived from the break's own id (see
 * `breakEntryId`), so a second call for the same break — from a retry, a
 * second device, or a component effect that re-entered — throws Dexie's
 * `ConstraintError` on the duplicate `add` rather than creating a second row.
 * That specific error is swallowed as success (the break *was* logged; that's
 * the point), while any other failure still propagates so the caller's retry
 * path holds.
 */
export async function writeBreakEntry(
  record: ActiveBreak,
  { endAtIso, elapsedSec, outcome }: WriteBreakEntryArgs,
): Promise<void> {
  // A quick action (e.g. "Call") carries its own project/category and tag; a
  // plain break falls back to the shared "Break" assignments.
  const isQuickAction = Boolean(record.tag);
  const assignments = isQuickAction
    ? { projectId: record.projectId ?? null, categoryId: record.categoryId ?? null }
    : await ensureBreakAssignments();
  const baseTag = isQuickAction ? record.tag! : BREAK_TAG;

  try {
    await createTimeEntry({
      id: breakEntryId(record.id),
      title: record.label,
      ...assignments,
      startAt: record.startedAt,
      endAt: endAtIso,
      durationSec: elapsedSec,
      tags: outcome === "cancelled" ? [baseTag, "cancelled"] : [baseTag],
      notes: composeBreakEntryNotes(record.description, record.notes),
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "ConstraintError") {
      throw error;
    }
    // Already logged by an earlier attempt — fall through to mark it finished.
  }

  // Marked regardless of which branch above ran: either way, this break id is
  // now durably logged and must never be resurrected by a stale cloud pull
  // (see `finished-breaks.ts` and `live-state-sync.ts`).
  markBreakFinished(record.id);
}
