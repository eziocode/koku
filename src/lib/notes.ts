import { db } from "@/lib/db";
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

export function extractWikiLinks(content: unknown) {
  const text = walkText(content);
  const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
  return Array.from(matches)
    .map((match) => slugify(match[1] || ""))
    .filter(Boolean);
}

export async function ensureUniqueNoteSlug(
  workspaceId: string,
  title: string,
  excludeId?: string,
) {
  const base = slugify(title) || "untitled-note";
  let candidate = base;
  let index = 1;

  while (true) {
    const existing = await db.note.findFirst({
      where: {
        workspaceId,
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    index += 1;
    candidate = `${base}-${index}`;
  }
}

export async function syncNoteLinks({
  noteId,
  workspaceId,
  content,
}: {
  noteId: string;
  workspaceId: string;
  content: unknown;
}) {
  const slugs = extractWikiLinks(content);
  const targets = slugs.length
    ? await db.note.findMany({
        where: {
          workspaceId,
          slug: { in: slugs },
          NOT: { id: noteId },
        },
        select: { id: true },
      })
    : [];

  await db.noteLink.deleteMany({ where: { sourceNoteId: noteId } });

  if (!targets.length) {
    return;
  }

  await db.noteLink.createMany({
    data: targets.map((target) => ({
      sourceNoteId: noteId,
      targetNoteId: target.id,
    })),
    skipDuplicates: true,
  });
}
