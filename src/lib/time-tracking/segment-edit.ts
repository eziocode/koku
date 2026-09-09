/**
 * What a hand-edited time range does to an entry's recorded runs.
 *
 * The runs in `segments` are measurements — the stretches a timer actually
 * ran — while an edited `startAt`/`endAt` is a claim about the whole session.
 * Reconciling the two only has one honest answer per case: moving the range
 * without changing its length moves every run with it, and any other edit
 * leaves nothing to derive pause times from. Stretching the runs to fit a
 * resized range would print a Paused/Resumed pair at times nobody paused.
 */

import type { RecordedRun } from "@/lib/time-tracking/run-repair";

interface EditableEntry {
  startAt: string;
  endAt?: string | null;
  segments?: RecordedRun[] | null;
}

interface RangePatch {
  startAt?: string;
  endAt?: string | null;
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function shift(runs: readonly RecordedRun[], deltaMs: number): RecordedRun[] | null {
  const moved: RecordedRun[] = [];
  for (const run of runs) {
    const startMs = parseMs(run.startAt);
    const endMs = parseMs(run.endAt);
    if (startMs === null || endMs === null) {
      return null;
    }
    moved.push({
      startAt: new Date(startMs + deltaMs).toISOString(),
      endAt: new Date(endMs + deltaMs).toISOString(),
    });
  }
  return moved;
}

/**
 * The `segments` an entry should keep once `patch` is applied to it.
 *
 * Untouched when the patch does not move the range; translated when both ends
 * move by the same amount; `null` otherwise, which drops the entry's log back
 * to a plain Started/Stopped pair over the new range.
 */
export function adjustSegmentsForRangeEdit(
  existing: EditableEntry,
  patch: RangePatch,
): RecordedRun[] | null {
  const segments = existing.segments ?? null;
  if (patch.startAt === undefined && patch.endAt === undefined) {
    return segments;
  }
  if (!segments?.length) {
    return null;
  }

  const oldStartMs = parseMs(existing.startAt);
  const newStartMs = parseMs(patch.startAt ?? existing.startAt);
  const oldEndMs = parseMs(existing.endAt);
  const newEndMs = parseMs(patch.endAt !== undefined ? patch.endAt : existing.endAt);
  if (oldStartMs === null || newStartMs === null || oldEndMs === null || newEndMs === null) {
    return null;
  }

  const startDelta = newStartMs - oldStartMs;
  if (startDelta !== newEndMs - oldEndMs) {
    return null;
  }
  if (startDelta === 0) {
    return segments;
  }
  return shift(segments, startDelta);
}
