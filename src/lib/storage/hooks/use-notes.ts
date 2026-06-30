"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";

import { ensureUniqueNoteSlug, extractWikiLinks, syncNoteLinks } from "@/lib/notes";
import { kokuDb, type Note } from "@/lib/storage/db";

const EMPTY_NOTES: Note[] = [];

interface CreateNoteInput {
  title: string;
  content: unknown;
  tags: string[];
}

export { extractWikiLinks, syncNoteLinks };

export function useNotes(search?: string) {
  const notes = useLiveQuery(async () => {
    const query = search?.trim().toLowerCase();
    let items = await kokuDb.notes.orderBy("updatedAt").reverse().toArray();

    if (query) {
      items = items.filter((note) => {
        const haystack = `${note.title} ${note.tags.join(" ")}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    return items;
  }, [search], EMPTY_NOTES);

  async function getNote(id: string) {
    const note = await kokuDb.notes.get(id);
    if (!note) {
      return null;
    }

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
      slug: await ensureUniqueNoteSlug(data.title),
      content: data.content,
      tags: data.tags,
      createdAt: now,
      updatedAt: now,
    };

    await kokuDb.transaction("rw", kokuDb.notes, kokuDb.noteLinks, async () => {
      await kokuDb.notes.add(note);
      await syncNoteLinks(note.id, note.content);
    });

    return note;
  }

  async function updateNote(
    id: string,
    patch: Partial<Pick<Note, "title" | "content" | "tags">>,
  ) {
    const existing = await kokuDb.notes.get(id);
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
          ? await ensureUniqueNoteSlug(nextTitle, id)
          : existing.slug,
      updatedAt: new Date().toISOString(),
    };

    await kokuDb.transaction("rw", kokuDb.notes, kokuDb.noteLinks, async () => {
      await kokuDb.notes.put(nextNote);
      await syncNoteLinks(id, nextContent);
    });

    return nextNote;
  }

  async function deleteNote(id: string) {
    await kokuDb.transaction("rw", kokuDb.notes, kokuDb.noteLinks, async () => {
      await kokuDb.noteLinks.where("sourceNoteId").equals(id).delete();
      await kokuDb.noteLinks.where("targetNoteId").equals(id).delete();
      await kokuDb.notes.delete(id);
    });
  }

  return {
    notes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
  };
}
