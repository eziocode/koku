"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type TimeEntry } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";
import {
  createTimeEntry,
  getDurationSec,
  type CreateTimeEntryInput,
} from "@/lib/time-tracking/time-entries";

const EMPTY_ENTRIES: TimeEntry[] = [];

export interface TimeEntryFilters {
  date?: string;
  from?: string;
  to?: string;
  projectId?: string;
  projectIds?: string[];
  categoryId?: string;
  categoryIds?: string[];
  tags?: string[];
  minDurationSec?: number;
  maxDurationSec?: number;
  search?: string;
}


function normalizeIds(ids?: string[], fallbackId?: string) {
  return Array.from(new Set([...(ids ?? []), fallbackId].filter(Boolean) as string[]));
}

function normalizeTags(tags?: string[]) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

function getLocalDayRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export function useTimeEntries(filters: TimeEntryFilters = {}) {
  const projectIds = normalizeIds(filters.projectIds, filters.projectId);
  const categoryIds = normalizeIds(filters.categoryIds, filters.categoryId);
  const tagFilters = normalizeTags(filters.tags);
  const dayRange = filters.date ? getLocalDayRange(filters.date) : null;
  const from = filters.from ?? dayRange?.from;
  const to = filters.to ?? dayRange?.to;
  const minDurationSec = filters.minDurationSec;
  const maxDurationSec = filters.maxDurationSec;
  const search = filters.search?.trim().toLowerCase();

  const entries = useLiveQuery(async () => {
    let items = from && to
      ? await kokuDb.timeEntries.where("startAt").between(from, to, true, true).toArray()
      : from
        ? await kokuDb.timeEntries.where("startAt").aboveOrEqual(from).toArray()
        : to
          ? await kokuDb.timeEntries.where("startAt").belowOrEqual(to).toArray()
          : await kokuDb.timeEntries.toArray();

    if (projectIds.length) {
      items = items.filter((entry) => entry.projectId ? projectIds.includes(entry.projectId) : false);
    }

    if (categoryIds.length) {
      items = items.filter((entry) => entry.categoryId ? categoryIds.includes(entry.categoryId) : false);
    }

    if (tagFilters.length) {
      items = items.filter((entry) => {
        const entryTags = normalizeTags(entry.tags);
        return tagFilters.every((tag) => entryTags.includes(tag));
      });
    }

    if (minDurationSec !== undefined) {
      items = items.filter((entry) => (entry.durationSec ?? 0) >= minDurationSec);
    }

    if (maxDurationSec !== undefined) {
      items = items.filter((entry) => (entry.durationSec ?? 0) <= maxDurationSec);
    }

    if (search) {
      items = items.filter((entry) => {
        const haystack = [entry.title, entry.notes || "", entry.tags.join(" ")]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    return items.sort((left, right) =>
      right.startAt.localeCompare(left.startAt) || right.createdAt.localeCompare(left.createdAt),
    );
  }, [
    filters.date,
    from,
    to,
    projectIds,
    categoryIds,
    tagFilters,
    minDurationSec,
    maxDurationSec,
    search,
  ], EMPTY_ENTRIES);

  async function createEntry(data: CreateTimeEntryInput) {
    return createTimeEntry(data);
  }

  async function updateEntry(
    id: string,
    patch: Partial<Omit<TimeEntry, "id" | "createdAt">>,
  ) {
    const existing = await kokuDb.timeEntries.get(id);
    if (!existing) {
      return null;
    }

    const next: TimeEntry = {
      ...existing,
      ...patch,
      durationSec:
        patch.durationSec !== undefined
          ? patch.durationSec
          : getDurationSec(
              patch.startAt ?? existing.startAt,
              patch.endAt !== undefined ? patch.endAt : existing.endAt,
            ),
    };

    await kokuDb.timeEntries.put(next);
    void syncRow("timeEntries", next);
    return next;
  }

  async function deleteEntry(id: string) {
    await kokuDb.timeEntries.delete(id);
    void deleteRow("timeEntries", id);
  }

  return {
    entries,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
