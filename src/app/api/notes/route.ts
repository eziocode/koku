import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { ensureUniqueNoteSlug, syncNoteLinks } from "@/lib/notes";
import { noteSchema } from "@/lib/validations/note";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const search = new URL(request.url).searchParams.get("search");
    const notes = await db.note.findMany({
      where: {
        workspaceId: context.workspace.id,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { tags: { has: search.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const body = await request.json();
    const parsed = noteSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const slug = await ensureUniqueNoteSlug(context.workspace.id, parsed.data.slug || parsed.data.title);
    const note = await db.note.create({
      data: {
        workspaceId: context.workspace.id,
        title: parsed.data.title,
        slug,
        content: parsed.data.content,
        tags: parsed.data.tags,
      },
    });

    await syncNoteLinks({
      noteId: note.id,
      workspaceId: context.workspace.id,
      content: parsed.data.content,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
