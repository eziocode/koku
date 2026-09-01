"use client";

/**
 * Applies one confirmed KokuAction to Dexie. Only called after the user
 * clicks "Add" on the action card the chat panel rendered: see the note in
 * `actions.ts` about why the model never writes directly.
 */

import { createTask } from "@/lib/tasks/tasks";
import { createTimeEntry } from "@/lib/time-tracking/time-entries";
import { ensureCategory, ensureProject } from "@/lib/time-tracking/time-entries";
import type { KokuAction } from "@/lib/ai/agent/actions";

export interface ApplyActionDeps {
  createNote: (data: { title: string; content: unknown; tags: string[] }) => Promise<unknown>;
}

function toNoteDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

export async function applyKokuAction(action: KokuAction, deps: ApplyActionDeps) {
  switch (action.type) {
    case "create_task": {
      const project = action.projectName ? await ensureProject(action.projectName) : null;
      const category = action.categoryName ? await ensureCategory(action.categoryName) : null;
      return createTask({
        title: action.title,
        priority: action.priority,
        notes: action.notes ?? null,
        projectId: project?.id ?? null,
        categoryId: category?.id ?? null,
        dueAt: action.dueAt ?? null,
        tags: [],
      });
    }
    case "log_time": {
      const project = action.projectName ? await ensureProject(action.projectName) : null;
      const category = action.categoryName ? await ensureCategory(action.categoryName) : null;
      const now = new Date();
      const startAt = new Date(now.getTime() - action.durationMinutes * 60_000).toISOString();
      return createTimeEntry({
        title: action.title,
        startAt,
        endAt: now.toISOString(),
        durationSec: action.durationMinutes * 60,
        projectId: project?.id ?? null,
        categoryId: category?.id ?? null,
        notes: action.notes ?? null,
        tags: [],
      });
    }
    case "create_note": {
      return deps.createNote({
        title: action.title,
        content: toNoteDoc(action.content),
        tags: action.tags,
      });
    }
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown Koku action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
