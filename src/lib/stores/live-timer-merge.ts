/**
 * Reconciling a cloud live-timer record with the timer already on this device.
 *
 * The live wire format carries a timer's identity and clock math but not its
 * run history (`segments`), its real run start (`runStartedAt`), its unshifted
 * `originalStartTime`, or its planned duration. The live poll runs every few
 * seconds against a *running* timer, so replacing the local timer with the
 * wire's version outright erased the pause history of the very session that
 * recorded it — every entry then stopped as one continuous run, whatever the
 * user did. Cloud stays authoritative for everything it actually speaks about;
 * these fields survive from the local timer instead.
 *
 * A pause or resume that happened on *another* device arrives here as a
 * `pausedAt` that flipped, with no run to go with it. Rather than lose that
 * stretch, the flip is recorded: pausing closes the open run at the cloud's
 * `pausedAt`, resuming opens a new one at the record's `updatedAt`.
 */

import type { ActiveTimer } from "@/lib/stores/timer-types";

/**
 * The timer to store for a cloud record, given whatever this device already
 * had under the same id.
 *
 * `adopted` is the record as read off the wire; pass `local` as `undefined`
 * for a timer this device has never seen, which is adopted as-is.
 */
export function reconcileCloudTimer(
  local: ActiveTimer | undefined,
  adopted: ActiveTimer,
): ActiveTimer {
  if (!local) {
    return adopted;
  }

  const merged: ActiveTimer = {
    ...adopted,
    // Never shifted by a resume, so the local copy is the accurate one; the
    // wire serialises it from the (possibly already shifted) start.
    originalStartTime: local.originalStartTime,
    segments: local.segments,
    runStartedAt: local.runStartedAt ?? adopted.runStartedAt,
    plannedDurationSec: local.plannedDurationSec,
  };

  const pausedRemotely = !local.pausedAt && adopted.pausedAt;
  const resumedRemotely = local.pausedAt && !adopted.pausedAt;

  if (pausedRemotely) {
    return {
      ...merged,
      segments: [
        ...local.segments,
        { startAt: local.runStartedAt ?? local.startTime, endAt: adopted.pausedAt as string },
      ],
    };
  }

  if (resumedRemotely) {
    return { ...merged, runStartedAt: adopted.updatedAt ?? new Date().toISOString() };
  }

  return merged;
}
