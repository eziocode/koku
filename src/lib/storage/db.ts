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
  startAt: string;
  endAt?: string | null;
  durationSec?: number | null;
  tags: string[];
  notes?: string | null;
  createdAt: string;
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

class KokuDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  categories!: EntityTable<Category, "id">;
  timeEntries!: EntityTable<TimeEntry, "id">;
  notes!: EntityTable<Note, "id">;
  noteLinks!: EntityTable<NoteLink, "id">;
  aiKeys!: EntityTable<AiKey, "id">;
  settings!: EntityTable<AppSetting, "key">;

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
    });
  }
}

export const kokuDb = new KokuDB();
