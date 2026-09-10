import { kokuDb, type Note } from "@/lib/storage/db";
import { ensureUniqueNoteSlug, syncNoteLinks } from "@/lib/notes";
import { localTransaction, putLocal, deleteLocal } from "@/lib/storage/local-write";
export type NoteScope = "shared" | "personal";
interface CreateNoteInput { title: string; content: unknown; tags: string[] }
function actions(scope: NoteScope) {
  const isPersonal = scope === "personal";
  const table = isPersonal ? kokuDb.personalNotes : kokuDb.notes;
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

    await localTransaction([table, kokuDb.noteLinks, kokuDb.noteDrafts], async () => {
      await putLocal(table, note, true);
      if (!isPersonal) await syncNoteLinks(note.id, note.content);
    });

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

    await localTransaction([table, kokuDb.noteLinks, kokuDb.noteDrafts], async () => {
      await putLocal(table, nextNote);
      if (!isPersonal) await syncNoteLinks(id, nextContent);
    });

    return nextNote;
  }

  async function deleteNote(id: string) {
    const links = isPersonal ? [] : await kokuDb.noteLinks.filter((link) => link.sourceNoteId === id || link.targetNoteId === id).toArray();
    await localTransaction([table, kokuDb.noteLinks, kokuDb.noteDrafts], async () => {
      for (const link of links) await deleteLocal(kokuDb.noteLinks, link.id);
      if (!isPersonal) {
        await kokuDb.noteLinks.where("sourceNoteId").equals(id).delete();
        await kokuDb.noteLinks.where("targetNoteId").equals(id).delete();
      }
      await deleteLocal(table, id);
      await kokuDb.noteDrafts.where("[scope+noteId]").equals([scope, id]).delete();
    });

  }

  return { getNote, createNote, updateNote, deleteNote };
}
const shared = actions("shared");
const personal = actions("personal");
export const noteActions = (scope: NoteScope) => scope === "personal" ? personal : shared;
