"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { kokuDb, type TimeEntry } from "@/lib/storage/db";

const EMPTY_ENTRIES: TimeEntry[] = [];

export interface TimeEntryFilters {
  date?: string;
  from?: string;
  to?: string;
  projectId?: string;
  categoryId?: string;
  search?: string;
}

interface CreateEntryInput {
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
  tags: string[];
  notes?: string | null;
}

function getDurationSec(startAt: string, endAt?: string | null) {
  if (!endAt) {
    return null;
  }

  return Math.max(0, Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 1000));
}

function toDayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function useTimeEntries(filters: TimeEntryFilters = {}) {
  const entries = useLiveQuery(async () => {
    const search = filters.search?.trim().toLowerCase();
    const from = filters.from;
    const to = filters.to;
    let items = await kokuDb.timeEntries.toArray();

    if (filters.date) {
      items = items.filter((entry) => toDayKey(entry.startAt) === filters.date);
    }

    if (from) {
      items = items.filter((entry) => entry.startAt >= from);
    }

    if (to) {
      items = items.filter((entry) => entry.startAt <= to);
    }

    if (filters.projectId) {
      items = items.filter((entry) => entry.projectId === filters.projectId);
    }

    if (filters.categoryId) {
      items = items.filter((entry) => entry.categoryId === filters.categoryId);
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
    filters.from,
    filters.to,
    filters.projectId,
    filters.categoryId,
    filters.search,
  ], EMPTY_ENTRIES);

  async function createEntry(data: CreateEntryInput) {
    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      title: data.title,
      projectId: data.projectId ?? null,
      categoryId: data.categoryId ?? null,
      startAt: data.startAt,
      endAt: data.endAt ?? null,
      durationSec: data.durationSec ?? getDurationSec(data.startAt, data.endAt),
      tags: data.tags,
      notes: data.notes ?? null,
      createdAt: new Date().toISOString(),
    };

    await kokuDb.timeEntries.add(entry);
    return entry;
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
    return next;
  }

  async function deleteEntry(id: string) {
    await kokuDb.timeEntries.delete(id);
  }

  return {
    entries,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
