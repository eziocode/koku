import Dexie, { type EntityTable } from "dexie";

export interface Project {
  id: string;
  name: string;
  color: string;
  hourlyRate?: number | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  title: string;
  projectId?: string | null;
  categoryId?: string | null;
  /** The task this session's time accumulates against, if any. */
  taskId?: string | null;
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
  tags: string[];
  notes?: string | null;
  createdAt: string;
}

export type TaskStatus = "open" | "in_progress" | "paused" | "done";
export type TaskPriority = "low" | "medium" | "high";

/**
 * A schedulable unit of work that a task's time entries accumulate against
 * over possibly many, non-contiguous sessions. `status: "done"` is what
 * removes it from the "log time against" picker — see `pickerTasks` in
 * `use-tasks.ts` — and `reopenedAt` is set when a closed task is reopened.
 */
export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string | null;
  /** Scheduled start, distinct from when work actually begins. */
  startAt?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  tags: string[];
  completedAt?: string | null;
  reopenedAt?: string | null;
  /** Kanban ordering within a status column. Never null — see the v6 index note. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  slug: string;
  content: unknown;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteLink {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
}

export interface AiKey {
  id: string;
  provider: string;
  apiKey: string;
  createdAt: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

export interface PendingDelete {
  id: string;
  table: string;
  rowId: string;
  revision: string;
  createdAt: string;
}

export interface PendingUpsert {
  id: string;
  table: string;
  rowId: string;
  row: unknown;
  revision: string;
  updatedAt: string;
}

/** Dedicated queue for ephemeral timer/break state. Never shown in manual sync. */
export interface PendingLiveMutation {
  id: string;
  kind: "timer" | "break" | "timer-tombstone" | "break-tombstone";
  record: unknown;
  updatedAt: string;
}

class KokuDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  categories!: EntityTable<Category, "id">;
  timeEntries!: EntityTable<TimeEntry, "id">;
  tasks!: EntityTable<Task, "id">;
  notes!: EntityTable<Note, "id">;
  personalNotes!: EntityTable<Note, "id">;
  noteLinks!: EntityTable<NoteLink, "id">;
  aiKeys!: EntityTable<AiKey, "id">;
  settings!: EntityTable<AppSetting, "key">;
  pendingDeletes!: EntityTable<PendingDelete, "id">;
  pendingUpserts!: EntityTable<PendingUpsert, "id">;
  pendingLiveMutations!: EntityTable<PendingLiveMutation, "id">;

  constructor() {
    super("koku-local");
    this.version(1).stores({
      projects: "id, createdAt",
      categories: "id, name, createdAt",
      timeEntries: "id, startAt, projectId, categoryId, createdAt",
      notes: "id, slug, updatedAt, createdAt",
      noteLinks: "id, sourceNoteId, targetNoteId",
      aiKeys: "id, provider, createdAt",
      settings: "key",
      pendingDeletes: "id, table, rowId, createdAt",
    });

    this.version(2).stores({
      projects: "id, createdAt",
      categories: "id, name, createdAt",
      timeEntries: "id, startAt, projectId, categoryId, createdAt, durationSec, [projectId+startAt], [categoryId+startAt]",
      notes: "id, slug, updatedAt, createdAt",
      noteLinks: "id, sourceNoteId, targetNoteId",
      aiKeys: "id, provider, createdAt",
      settings: "key",
      pendingDeletes: "id, table, rowId, createdAt",
    });

    this.version(3).stores({
      projects: "id, createdAt",
      categories: "id, name, createdAt",
      timeEntries: "id, startAt, projectId, categoryId, createdAt, durationSec, [projectId+startAt], [categoryId+startAt]",
      notes: "id, slug, updatedAt, createdAt",
      noteLinks: "id, sourceNoteId, targetNoteId",
      aiKeys: "id, provider, createdAt",
      settings: "key",
      pendingDeletes: "id, table, rowId, [table+rowId], createdAt",
      pendingUpserts: "id, table, rowId, [table+rowId], updatedAt",
    });

    this.version(4).stores({
      projects: "id, createdAt",
      categories: "id, name, createdAt",
      timeEntries: "id, startAt, projectId, categoryId, createdAt, durationSec, [projectId+startAt], [categoryId+startAt]",
      notes: "id, slug, updatedAt, createdAt",
      personalNotes: "id, slug, updatedAt, createdAt",
      noteLinks: "id, sourceNoteId, targetNoteId",
      aiKeys: "id, provider, createdAt",
      settings: "key",
      pendingDeletes: "id, table, rowId, [table+rowId], createdAt",
      pendingUpserts: "id, table, rowId, [table+rowId], updatedAt",
    });

    this.version(5).stores({
      projects: "id, createdAt",
      categories: "id, name, createdAt",
      timeEntries: "id, startAt, projectId, categoryId, createdAt, durationSec, [projectId+startAt], [categoryId+startAt]",
      notes: "id, slug, updatedAt, createdAt",
      personalNotes: "id, slug, updatedAt, createdAt",
      noteLinks: "id, sourceNoteId, targetNoteId",
      aiKeys: "id, provider, createdAt",
      settings: "key",
      pendingDeletes: "id, table, rowId, [table+rowId], createdAt",
      pendingUpserts: "id, table, rowId, [table+rowId], updatedAt",
      pendingLiveMutations: "id, kind, updatedAt",
    });

    this.version(6)
      .stores({
        projects: "id, createdAt",
        categories: "id, name, createdAt",
        timeEntries:
          "id, startAt, projectId, categoryId, createdAt, durationSec, taskId, " +
          "[projectId+startAt], [categoryId+startAt], [taskId+startAt]",
        tasks:
          "id, status, priority, dueAt, projectId, categoryId, sortOrder, updatedAt, createdAt, " +
          "[status+sortOrder], [status+dueAt], [projectId+status]",
        notes: "id, slug, updatedAt, createdAt",
        personalNotes: "id, slug, updatedAt, createdAt",
        noteLinks: "id, sourceNoteId, targetNoteId",
        aiKeys: "id, provider, createdAt",
        settings: "key",
        pendingDeletes: "id, table, rowId, [table+rowId], createdAt",
        pendingUpserts: "id, table, rowId, [table+rowId], updatedAt",
        pendingLiveMutations: "id, kind, updatedAt",
      })
      .upgrade(async (tx) => {
        // Not needed for the `taskId` index itself — Dexie backfills that from
        // existing records. Needed so every local row carries the same key set
        // a cloud round-trip would produce: `stable()` in sync-engine.ts
        // enumerates keys, and a row missing `taskId` never string-matches a
        // pulled row with `taskId: null`, which would surface a phantom sync
        // conflict on every entry, forever.
        await tx
          .table("timeEntries")
          .toCollection()
          .modify((entry) => {
            if (entry.taskId === undefined) entry.taskId = null;
          });
      });
  }
}

export const kokuDb = new KokuDB();
