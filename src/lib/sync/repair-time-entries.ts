import { fromCatalystDateTime, isRawCatalystDateTime } from "@/lib/db/catalyst-datetime";
import { kokuDb } from "@/lib/storage/db";

/**
 * One-time local repair for entries corrupted by a since-fixed sync bug:
 * `timeEntries.fromRow` used to save Catalyst's raw "YYYY-MM-DD HH:MM:SS"
 * straight into `startAt`/`endAt`/`createdAt` instead of converting it back to
 * a proper UTC ISO string. That raw string has no timezone marker, so every
 * later `new Date(...)` on it parsed as local time instead of UTC — shifting
 * the entry's displayed start/end by the viewer's UTC offset.
 *
 * The cloud copy was never wrong (only the local read-back was), so this only
 * needs to fix rows already sitting in Dexie — nothing needs to be re-pushed.
 * Safe to run repeatedly: a row with no raw-format field is left untouched.
 */
export async function repairTimeEntryTimestamps(): Promise<number> {
  const entries = await kokuDb.timeEntries.toArray();
  const fixed = entries.flatMap((entry) => {
    const startAt = isRawCatalystDateTime(entry.startAt) ? fromCatalystDateTime(entry.startAt) : null;
    const endAt = isRawCatalystDateTime(entry.endAt) ? fromCatalystDateTime(entry.endAt) : null;
    const createdAt = isRawCatalystDateTime(entry.createdAt) ? fromCatalystDateTime(entry.createdAt) : null;

    if (startAt === null && endAt === null && createdAt === null) {
      return [];
    }

    return [{
      ...entry,
      startAt: startAt ?? entry.startAt,
      endAt: endAt ?? entry.endAt,
      createdAt: createdAt ?? entry.createdAt,
    }];
  });

  if (fixed.length > 0) {
    await kokuDb.timeEntries.bulkPut(fixed);
  }

  return fixed.length;
}
