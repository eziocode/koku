import { BREAK_TAG } from "@/lib/notifications/settings";
import type { ActiveBreak } from "@/lib/stores/timer-types";
import { createTimeEntry, ensureBreakAssignments } from "@/lib/time-tracking/time-entries";

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

  await createTimeEntry({
    title: record.label,
    ...assignments,
    startAt: record.startedAt,
    endAt: endAtIso,
    durationSec: elapsedSec,
    tags: outcome === "cancelled" ? [baseTag, "cancelled"] : [baseTag],
    notes: composeBreakEntryNotes(record.description, record.notes),
  });
}
