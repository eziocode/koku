"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { ensureUniqueNoteSlug, extractWikiLinks, syncNoteLinks } from "@/lib/notes";
import { kokuDb, type Note } from "@/lib/storage/db";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

const EMPTY_NOTES: Note[] = [];
export type NoteScope = "shared" | "personal";

interface CreateNoteInput {
  title: string;
  content: unknown;
  tags: string[];
}

export { extractWikiLinks, syncNoteLinks };

export function useNotes(search?: string, scope: NoteScope = "shared") {
  const isPersonal = scope === "personal";
  const table = isPersonal ? kokuDb.personalNotes : kokuDb.notes;
  const syncTable = isPersonal ? "personalNotes" : "notes";
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

  async function getNote(id: string) {
    const note = await table.get(id);
    if (!note) {
      return null;
    }

    if (isPersonal) return { ...note, linkedNotes: [] };
    const links = await kokuDb.noteLinks.where("sourceNoteId").equals(id).toArray();
    const linkedNotes = links.length
      ? await kokuDb.notes.bulkGet(links.map((link) => link.targetNoteId))
      : [];

    return {
      ...note,
      linkedNotes: linkedNotes
        .filter((linkedNote): linkedNote is Note => Boolean(linkedNote))
        .map((linkedNote) => ({
          id: linkedNote.id,
          title: linkedNote.title,
          slug: linkedNote.slug,
        })),
    };
  }

  async function createNote(data: CreateNoteInput) {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: data.title,
      slug: await ensureUniqueNoteSlug(data.title, undefined, scope),
      content: data.content,
      tags: data.tags,
      createdAt: now,
      updatedAt: now,
    };

    await kokuDb.transaction("rw", table, kokuDb.noteLinks, async () => {
      await table.add(note);
      if (!isPersonal) await syncNoteLinks(note.id, note.content);
    });
    void syncRow(syncTable, note);

    return note;
  }

  async function updateNote(
    id: string,
    patch: Partial<Pick<Note, "title" | "content" | "tags">>,
  ) {
    const existing = await table.get(id);
    if (!existing) {
      return null;
    }

    const nextTitle = patch.title ?? existing.title;
    const nextContent = patch.content ?? existing.content;
    const nextNote: Note = {
      ...existing,
      ...patch,
      title: nextTitle,
      content: nextContent,
      tags: patch.tags ?? existing.tags,
      slug:
        patch.title && patch.title !== existing.title
          ? await ensureUniqueNoteSlug(nextTitle, id, scope)
          : existing.slug,
      updatedAt: new Date().toISOString(),
    };

    await kokuDb.transaction("rw", table, kokuDb.noteLinks, async () => {
      await table.put(nextNote);
      if (!isPersonal) await syncNoteLinks(id, nextContent);
    });
    void syncRow(syncTable, nextNote);

    return nextNote;
  }

  async function deleteNote(id: string) {
    const links = isPersonal ? [] : await kokuDb.noteLinks.filter((link) => link.sourceNoteId === id || link.targetNoteId === id).toArray();
    await kokuDb.transaction("rw", table, kokuDb.noteLinks, async () => {
      if (!isPersonal) {
        await kokuDb.noteLinks.where("sourceNoteId").equals(id).delete();
        await kokuDb.noteLinks.where("targetNoteId").equals(id).delete();
      }
      await table.delete(id);
    });
    if (!isPersonal) await Promise.all(links.map((link) => deleteRow("noteLinks", link.id)));
    void deleteRow(syncTable, id);
  }

  return {
    notes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
  };
}
