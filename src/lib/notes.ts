import { format } from "date-fns";

import { kokuDb, type Note } from "@/lib/storage/db";
import { slugify } from "@/lib/utils";
import { deleteRow, syncRow } from "@/lib/sync/sync-engine";

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

  const oldLinks = await kokuDb.noteLinks.where("sourceNoteId").equals(noteId).toArray();
  await kokuDb.noteLinks.where("sourceNoteId").equals(noteId).delete();
  await Promise.all(oldLinks.map((link) => deleteRow("noteLinks", link.id)));
  if (targets.length) {
    const links = targets
        .filter((target) => target.id !== noteId)
        .map((target) => ({
          id: crypto.randomUUID(),
          sourceNoteId: noteId,
          targetNoteId: target.id,
        }));
    await kokuDb.noteLinks.bulkPut(links);
    await Promise.all(links.map((link) => syncRow("noteLinks", link)));
  }
}

/* ─── Quick notes ─────────────────────────────────────────────────────────── */

/**
 * The tag every quick note carries in the notes section.
 *
 * Deliberately NOT `QUICK_NOTE_TAG` from `lib/notifications/settings`. That one
 * is a *time entry* tag that report filters exclude from work totals
 * (`buildSegmentedDays({ excludeTags })`); reusing it here would couple note
 * tagging to reporting behaviour, so that a change to one silently moves the
 * other.
 */
export const QUICK_NOTE_NOTE_TAG = "Quicknote";

/** Where a quick note came from, for the stamp line. */
export interface QuickNoteOrigin {
  kind: "timer" | "break" | "standalone";
  /** Timer title or break label; `null` when nothing was running. */
  label: string | null;
  /** Tracked seconds at the moment the note was written, when known. */
  elapsedSec: number | null;
}

/** Titles are the only thing the notes list shows, so keep them scannable. */
export function buildQuickNoteTitle(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return "Quick note";
  }

  return collapsed.length > 60 ? `${collapsed.slice(0, 59)}…` : collapsed;
}

/**
 * The "pre description" line: when it was logged, and what it was logged against.
 *
 * Pure and separately exported so the wording is asserted by tests rather than
 * by reading a rendered note.
 */
export function buildQuickNoteStamp(
  loggedAt: Date,
  origin: QuickNoteOrigin,
  formatElapsed: (seconds: number) => string,
): string {
  const when = format(loggedAt, "d MMM yyyy · HH:mm");

  if (origin.kind === "timer" && origin.label) {
    const elapsed = origin.elapsedSec === null ? null : formatElapsed(origin.elapsedSec);
    return elapsed
      ? `Logged ${when} · while tracking “${origin.label}” (${elapsed})`
      : `Logged ${when} · while tracking “${origin.label}”`;
  }

  if (origin.kind === "break" && origin.label) {
    return `Logged ${when} · during your ${origin.label.toLowerCase()}`;
  }

  return `Logged ${when} · no timer running`;
}

/**
 * A TipTap doc: the stamp as an italic first paragraph, then the user's text.
 *
 * Two paragraphs rather than one, so the stamp can be deleted without taking
 * the note with it — and so the user's own words start on their own line ready
 * to be expanded, which is the whole point of a quick note landing here.
 */
export function buildQuickNoteDoc(text: string, stamp: string): unknown {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", marks: [{ type: "italic" }], text: stamp }],
      },
      {
        type: "paragraph",
        content: text.trim() ? [{ type: "text", text: text.trim() }] : [],
      },
    ],
  };
}

/**
 * Writes a quick note into the notes section.
 *
 * Bypasses `useNotes().createNote` on purpose: that hook opens a `liveQuery`
 * over every note, and the composer has no use for the list — subscribing just
 * to gain a writer would re-render it on every unrelated note change.
 *
 * Mirrors `createNote`'s transaction so slug uniqueness and `[[wiki links]]`
 * behave identically to a note created by hand.
 */
export async function persistQuickNote(
  text: string,
  origin: QuickNoteOrigin,
  formatElapsed: (seconds: number) => string,
  loggedAt: Date = new Date(),
): Promise<Note> {
  const title = buildQuickNoteTitle(text);
  const content = buildQuickNoteDoc(text, buildQuickNoteStamp(loggedAt, origin, formatElapsed));
  const iso = loggedAt.toISOString();

  const note: Note = {
    id: crypto.randomUUID(),
    title,
    slug: await ensureUniqueNoteSlug(title),
    content,
    tags: [QUICK_NOTE_NOTE_TAG],
    createdAt: iso,
    updatedAt: iso,
  };

  await kokuDb.transaction("rw", kokuDb.notes, kokuDb.noteLinks, async () => {
    await kokuDb.notes.add(note);
    await syncNoteLinks(note.id, note.content);
  });
  void syncRow("notes", note);

  return note;
}
