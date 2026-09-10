import type { DBCore, Dexie } from "dexie";
import type { Note } from "./db";

export type NoteMetadata = Omit<Note, "content">;
export const metadataTables: Record<string, string> = {
  notes: "noteMetadata",
  personalNotes: "personalNoteMetadata",
};
export function toNoteMetadata(note: Note): NoteMetadata {
  return { id: note.id, title: note.title, slug: note.slug, tags: note.tags, createdAt: note.createdAt, updatedAt: note.updatedAt };
}

/** Local repair only; never enters portable backups or cloud payloads. */
export async function rebuildNoteMetadata(db: Dexie) {
  await db.transaction("rw", Object.entries(metadataTables).flat(), async () => {
    for (const [source, target] of Object.entries(metadataTables)) {
      const rows: NoteMetadata[] = [];
      await db.table(source).toCollection().each((note: Note) => { rows.push(toNoteMetadata(note)); });
      await db.table(target).clear();
      await db.table(target).bulkPut(rows);
    }
  });
}

/** Mirror at the storage boundary so cloud imports, restores, bulk operations,
 * and ordinary edits cannot bypass the projection. Both writes share the native
 * IDB transaction: projection failure must abort the document write too. */
export function installNoteMetadata(db: Dexie) {
  db.use({
    stack: "dbcore", name: "note-metadata", level: 3,
    create(down: DBCore): DBCore {
      const available = new Set(down.schema.tables.map((table) => table.name));
      const targetFor = (name: string) => available.has(metadataTables[name]) ? metadataTables[name] : undefined;
      return {
        ...down,
        transaction(stores, mode, options) {
          const expanded = mode === "readwrite" ? [...new Set([...stores, ...stores.flatMap((name) => targetFor(name) ?? [])])] : stores;
          return down.transaction(expanded, mode, options);
        },
        table(name) {
          const table = down.table(name);
          const target = targetFor(name);
          if (!target) return table;
          const metadata = down.table(target);
          return {
            ...table,
            mutate(request) {
              return table.mutate(request).then(async (result) => {
                try {
                  let mirrored;
                  if (request.type === "add" || request.type === "put") {
                    // Read the committed values, including Dexie's partial update
                    // operations. Failed bulk items must not enter the projection.
                    const keys = (result.results ?? []).filter((_, index) => !result.failures[index]);
                    const rows = await table.getMany({ trans: request.trans, keys });
                    mirrored = await metadata.mutate({ type: "put", trans: request.trans, values: rows.filter(Boolean).map(toNoteMetadata) });
                  } else if (request.type === "delete") {
                    mirrored = await metadata.mutate({ type: "delete", trans: request.trans, keys: request.keys.filter((_, index) => !result.failures[index]) });
                  } else if (!result.numFailures) {
                    mirrored = await metadata.mutate({ type: "deleteRange", trans: request.trans, range: request.range });
                  }
                  if (mirrored?.numFailures) throw Object.values(mirrored.failures)[0];
                  return result;
                } catch (error) {
                  request.trans.abort();
                  throw error;
                }
              });
            },
          };
        },
      };
    },
  });
}
