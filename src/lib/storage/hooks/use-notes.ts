"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { extractWikiLinks, syncNoteLinks } from "@/lib/notes";
import { kokuDb, type Note } from "@/lib/storage/db";
import { noteActions, type NoteScope } from "@/lib/storage/note-actions";
export type { NoteScope } from "@/lib/storage/note-actions";

const EMPTY_NOTES: Note[] = [];
export { extractWikiLinks, syncNoteLinks };

export function useNotes(search?: string, scope: NoteScope = "shared") {
  const isPersonal = scope === "personal";
  const table = isPersonal ? kokuDb.personalNotes : kokuDb.notes;
  const notes = useLiveQuery(async () => {
    const query = search?.trim().toLowerCase();
    let items = await table.orderBy("updatedAt").reverse().toArray();

    if (query) {
      items = items.filter((note) => {
        const haystack = `${note.title} ${note.tags.join(" ")}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    return items;
  }, [search, scope], EMPTY_NOTES);

  return { notes, ...noteActions(scope) };
}
