"use client";
import { kokuDb } from "../db";
import type { NoteMetadata } from "../note-metadata";
import type { NoteScope } from "../note-actions";
import { useLiveQuery } from "../use-live-query";

const EMPTY: NoteMetadata[] = [];
export function useNoteMetadata(search?: string, scope: NoteScope = "shared") {
  const result = useLiveQuery(async () => {
    const table = scope === "personal" ? kokuDb.personalNoteMetadata : kokuDb.noteMetadata;
    const query = search?.trim().toLowerCase();
    const notes = await table.orderBy("updatedAt").reverse().toArray();
    return { scope, notes: query ? notes.filter((note) => `${note.title} ${note.tags.join(" ")}`.toLowerCase().includes(query)) : notes };
  }, [scope, search]);
  // Never show a previous scope while the new live query is loading.
  return { notes: result?.scope === scope ? result.notes : EMPTY };
}
