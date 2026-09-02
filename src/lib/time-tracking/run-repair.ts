/**
 * Reconstructs real work-run start times for entries corrupted by a
 * since-fixed timer bug.
 *
 * A resumed timer advances its internal clock-math `startTime` forward by the
 * paused delta (`resumePausedTimer` in `@/lib/stores/timer-math`), and every
 * run after the first used to be recorded from that shifted value instead of
 * the real resume instant. So the *n*-th recorded run's `startAt` is
 * `realStart_n - Σ(earlier durations)` — earlier than it happened, and long
 * enough to swallow whatever ran during the pause it followed. A parallel task
 * started in that pause then reads as overlapping it, not sitting inside it.
 *
 * The corruption has a fingerprint that makes it exactly invertible: because
 * `endAt` on every recorded run is real (never shifted), the *last* run's
 * recorded span equals the entry's *entire* worked duration — that is what the
 * shifted start engineers. A correctly recorded entry has no such property;
 * its runs' spans instead sum to the duration. That difference is the gate
 * that keeps this from mangling clean data, and it is why the transform must
 * not be applied twice — re-running it on already-repaired runs would invent a
 * second shift where none exists.
 */

export interface RecordedRun {
  startAt: string;
  endAt: string;
}

const CORRUPTION_TOLERANCE_SEC = 2;

function parseMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Real run starts for runs recorded against the resume-shifted `startTime`.
 *
 * Returns `null` when the entry must be left alone: fewer than two runs (a
 * single run's start was never shifted), unparsable or non-monotonic
 * timestamps, an already-repaired or hand-edited row, or a reconstruction that
 * fails its own sanity check.
 */
export function reconstructRunStarts(
  runs: readonly RecordedRun[] | null | undefined,
  durationSec: number | null | undefined,
): RecordedRun[] | null {
  if (!runs || runs.length < 2 || durationSec === null || durationSec === undefined) {
    return null;
  }
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return null;
  }

  const parsed = runs.map((run) => ({ startMs: parseMs(run.startAt), endMs: parseMs(run.endAt) }));
  if (parsed.some((run) => run.startMs === null || run.endMs === null)) {
    return null;
  }
  const spans = parsed as { startMs: number; endMs: number }[];

  for (let i = 0; i < spans.length; i += 1) {
    if (spans[i].endMs <= spans[i].startMs) {
      return null;
    }
    if (i > 0 && spans[i].endMs < spans[i - 1].endMs) {
      return null;
    }
  }

  const totalSpanSec = spans.reduce((sum, run) => sum + (run.endMs - run.startMs) / 1000, 0);
  const lastSpanSec = (spans[spans.length - 1].endMs - spans[spans.length - 1].startMs) / 1000;

  // Already correct: spans sum to the duration. Leave it alone.
  if (Math.abs(totalSpanSec - durationSec) <= CORRUPTION_TOLERANCE_SEC) {
    return null;
  }
  // Not the known corruption signature (e.g. a hand-edited duration): leave it,
  // rather than guessing.
  if (Math.abs(lastSpanSec - durationSec) > CORRUPTION_TOLERANCE_SEC) {
    return null;
  }

  // The shift accumulated before run i equals run (i-1)'s own *recorded* span
  // (`endAt - startAt` as stored, corrupted) — not a running sum across every
  // earlier run. That recorded span already equals the prefix sum of every
  // real duration up to and including run i-1, which is exactly the shift run
  // i needs undone. (This is also why the *last* run's recorded span equals
  // the entry's whole duration: it is the prefix sum through the final run.)
  let previousRecordedSpanSec = 0;
  const rebuilt: RecordedRun[] = spans.map((run, index) => {
    const realStartMs = run.startMs + previousRecordedSpanSec * 1000;
    previousRecordedSpanSec = (run.endMs - run.startMs) / 1000;
    return { startAt: new Date(realStartMs).toISOString(), endAt: runs[index].endAt };
  });

  // Sanity-check the reconstruction before trusting it: the first run is
  // untouched, every run starts no earlier than the previous one ended, and
  // starts before it ends.
  const rebuiltMs = rebuilt.map((run) => ({ startMs: Date.parse(run.startAt), endMs: Date.parse(run.endAt) }));
  if (rebuiltMs[0].startMs !== spans[0].startMs) {
    return null;
  }
  for (let i = 0; i < rebuiltMs.length; i += 1) {
    if (rebuiltMs[i].startMs >= rebuiltMs[i].endMs) {
      return null;
    }
    if (i > 0 && rebuiltMs[i].startMs < rebuiltMs[i - 1].endMs) {
      return null;
    }
  }

  return rebuilt;
}
