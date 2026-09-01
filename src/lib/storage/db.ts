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
  /** Disjoint active stretches, in order. Present only when the session was
   *  paused/resumed at least once. Absent/empty means one continuous stretch
   *  (startAt–endAt). */
  segments?: { startAt: string; endAt: string }[] | null;
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
  /** Seconds banked from in-progress stretches that have already ended. */
  accumulatedSec: number;
  /** ISO stamp of the current in-progress stretch, null while not running. */
  inProgressSince: string | null;
  /** Set when this task was created via the timer's inline "+ new task"
   *  dialog, as opposed to picked from an existing list. Drives what happens
   *  to the task when its linked timer stops — see timer-task-sync.ts. */
  timerOrigin?: boolean;
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

export type AiAuthMode = "api-key" | "cli" | "org-cli";
export type AiCliTransport = "bridge" | "same-host";

/** Local-CLI connection details. Only meaningful when authMode is "cli" or "org-cli". */
export interface AiCliConfig {
  cliId: string;
  extraArgs: string[];
  transport: AiCliTransport;
  bridgeUrl: string;
  bridgeToken: string;
}

export interface AiKey {
  id: string;
  provider: string;
  /** How this connection authenticates. Defaults to "api-key" for pre-v9 rows. */
  authMode: AiAuthMode;
  apiKey: string;
  /** Non-null only for "cli" / "org-cli" auth modes. */
  cli: AiCliConfig | null;
  /** Set once a connection test succeeds. Gates the floating Koku AI assistant. */
  lastVerifiedAt: string | null;
  createdAt: string;
}

export type ReminderRepeat = "none" | "daily" | "weekly";

/**
 * A standalone, user-set alarm — not tied to any timer or task. `triggerAt` is
 * always the *next* time this should fire; `ReminderScheduler` advances it by
 * a day/week on each firing instead of leaving it fixed, so a repeating
 * reminder never needs a separate "last fired" computation to know when it's
 * next due.
 */
export interface Reminder {
  id: string;
  message: string;
  triggerAt: string;
  repeat: ReminderRepeat;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

/**
 * A record of one notification actually shown to the user — powers the bell
 * icon in the topbar. Purely local, like `pendingLiveMutations`: never synced
 * across devices, since a notification history is device-specific by nature.
 */
export interface NotificationLogEntry {
  id: string;
  title: string;
  body: string;
  tag: string | null;
  kokuType: string | null;
  createdAt: string;
  /** `null` until the user opens the bell popover; see `use-notification-log.ts`. */
  readAt: string | null;
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
  notificationLog!: EntityTable<NotificationLogEntry, "id">;
  reminders!: EntityTable<Reminder, "id">;

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

    this.version(7).stores({
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
      notificationLog: "id, createdAt, tag, readAt",
    });

    this.version(8)
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
        notificationLog: "id, createdAt, tag, readAt",
      })
      .upgrade(async (tx) => {
        // Same reasoning as the v6 taskId backfill: every local row needs the
        // same key set a cloud round-trip would produce, so a pulled task
        // (which won't carry these fields until the server does) string-matches
        // instead of surfacing a phantom sync conflict forever.
        await tx
          .table("tasks")
          .toCollection()
          .modify((task) => {
            if (task.accumulatedSec === undefined) task.accumulatedSec = 0;
            if (task.inProgressSince === undefined) task.inProgressSince = null;
          });
      });

    this.version(9)
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
        notificationLog: "id, createdAt, tag, readAt",
      })
      .upgrade(async (tx) => {
        // Every pre-v9 key was necessarily an API-key connection (it's the
        // only mode that existed), and had never been through a typed
        // connection test, so it starts unverified until re-tested.
        await tx
          .table("aiKeys")
          .toCollection()
          .modify((key) => {
            if (key.authMode === undefined) key.authMode = "api-key";
            if (key.cli === undefined) key.cli = null;
            if (key.lastVerifiedAt === undefined) key.lastVerifiedAt = null;
          });
      });

    this.version(10).stores({
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
      notificationLog: "id, createdAt, tag, readAt",
      reminders: "id, triggerAt, active",
    });
  }
}

export const kokuDb = new KokuDB();
