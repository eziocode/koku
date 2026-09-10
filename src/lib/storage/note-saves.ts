import { kokuDb, type NoteDraft } from "./db";
import { noteActions, type NoteScope } from "./note-actions";
import { localTransaction } from "./local-write";

type Listener = (status: string, slug?: string, updatedAt?: string) => void;
type Save = { draft: NoteDraft; persisted: Promise<unknown>; timer?: ReturnType<typeof setTimeout>; listener?: Listener };
const saves = new Map<string, Save>();
const session = () => crypto.randomUUID();
let sessionId: string | undefined;

export function stageNote(noteId: string, scope: NoteScope, payload: NoteDraft["payload"], baseUpdatedAt: string, listener?: Listener) {
  sessionId ??= session();
  const id = `${scope}:${noteId}:${sessionId}`;
  const previous = saves.get(id);
  if (previous?.timer) clearTimeout(previous.timer);
  const draft: NoteDraft = { id, noteId, scope, payload: structuredClone(payload), baseUpdatedAt: previous?.draft.baseUpdatedAt ?? baseUpdatedAt, updatedAt: new Date().toISOString() };
  const save: Save = { draft, listener, persisted: Promise.resolve() };
  saves.set(id, save);
  listener?.("Saving…");
  // Write the draft immediately, independent of the editor's lifetime.
  save.persisted = (previous?.persisted.catch(() => undefined) ?? Promise.resolve()).then(() => kokuDb.noteDrafts.put(draft));
  void save.persisted.catch(() => listener?.("Save failed — keep this tab open and retry"));
  save.timer = setTimeout(() => { void commitNote(id).catch(() => undefined); }, 350);
  return id;
}

const committing = new Map<string, Promise<void>>();
export function commitNote(id: string): Promise<void> {
  const previous = committing.get(id) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(() => commit(id));
  committing.set(id, result);
  void result.finally(() => { if (committing.get(id) === result) committing.delete(id); }).catch(() => undefined);
  return result;
}
async function commit(id: string) {
  const save = saves.get(id);
  if (!save) return;
  clearTimeout(save.timer);
  await save.persisted;
  const { draft } = save;
  const table = draft.scope === "personal" ? kokuDb.personalNotes : kokuDb.notes;
  try {
    const result = await localTransaction([table, kokuDb.noteLinks, kokuDb.noteDrafts], async () => {
      const existing = await table.get(draft.noteId);
      if (!existing) throw new Error("Note deleted — save your draft as a copy");
      if (existing.updatedAt !== draft.baseUpdatedAt) throw new Error("Note changed elsewhere — save your draft as a copy");
      const updated = await noteActions(draft.scope).updateNote(draft.noteId, draft.payload);
      if (!updated) throw new Error("Save failed — retry");
      const currentDraft = await kokuDb.noteDrafts.get(id);
      if (currentDraft?.updatedAt === draft.updatedAt && JSON.stringify(currentDraft.payload) === JSON.stringify(draft.payload)) await kokuDb.noteDrafts.delete(id);
      return updated;
    });
    const current = saves.get(id);
    if (current === save) {
      saves.delete(id);
      save.listener?.("Saved locally", result.slug, result.updatedAt);
    } else if (current) {
      current.draft.baseUpdatedAt = result.updatedAt;
      current.persisted = current.persisted.then(() => kokuDb.noteDrafts.put(current.draft));
    }
  } catch (error) {
    save.listener?.(error instanceof Error ? error.message : "Save failed — retry");
    throw error;
  }
}

export async function flushNoteSaves() {
  const results = await Promise.allSettled([...saves.keys()].map(commitNote));
  if (results.some((result) => result.status === "rejected")) throw new Error("Some notes could not be saved. Return to the editor to retry or save a copy.");
}

export function hasPendingNoteSaves() { return saves.size > 0; }
export function detachNoteSave(id: string) { const save = saves.get(id); if (save) save.listener = undefined; }
export async function discardNoteSave(id: string) {
  const save = saves.get(id);
  if (save) { clearTimeout(save.timer); await save.persisted.catch(() => undefined); }
  saves.delete(id);
  await kokuDb.noteDrafts.delete(id);
}
