import { kokuDb } from "@/lib/storage/db";
import { slugify } from "@/lib/utils";

function walkText(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(walkText).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(walkText)
      .join(" ");
  }

  return "";
}

export function extractWikiLinks(content: unknown): string[] {
  const text = walkText(content);
  const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
  return Array.from(matches)
    .map((match) => slugify(match[1] || ""))
    .filter(Boolean);
}

export async function ensureUniqueNoteSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || "untitled-note";
  let candidate = base;
  let i = 1;

  while (true) {
    const existing = await kokuDb.notes.where("slug").equals(candidate).first();
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    candidate = `${base}-${++i}`;
  }
}

export async function syncNoteLinks(noteId: string, content: unknown): Promise<void> {
  const slugs = extractWikiLinks(content);
  const targets = slugs.length
    ? await kokuDb.notes.where("slug").anyOf(slugs).toArray()
    : [];

  await kokuDb.noteLinks.where("sourceNoteId").equals(noteId).delete();
  if (targets.length) {
    await kokuDb.noteLinks.bulkPut(
      targets
        .filter((target) => target.id !== noteId)
        .map((target) => ({
          id: crypto.randomUUID(),
          sourceNoteId: noteId,
          targetNoteId: target.id,
        })),
    );
  }
}
