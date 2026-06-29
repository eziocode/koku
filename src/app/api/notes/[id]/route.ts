import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { ensureUniqueNoteSlug, syncNoteLinks } from "@/lib/notes";
import { noteUpdateSchema } from "@/lib/validations/note";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const { id } = await params;
    const note = await db.note.findFirst({ where: { id, workspaceId: context.workspace.id } });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json(note);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const body = await request.json();
    const parsed = noteUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const { id } = await params;
    const existing = await db.note.findFirst({ where: { id, workspaceId: context.workspace.id } });

    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const slug = parsed.data.title || parsed.data.slug
      ? await ensureUniqueNoteSlug(context.workspace.id, parsed.data.slug || parsed.data.title || existing.title, id)
      : existing.slug;

    const note = await db.note.update({
      where: { id },
      data: {
        title: parsed.data.title,
        slug,
        content: parsed.data.content,
        tags: parsed.data.tags,
      },
    });

    await syncNoteLinks({
      noteId: note.id,
      workspaceId: context.workspace.id,
      content: note.content,
    });

    return NextResponse.json(note);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const { id } = await params;
    const deleted = await db.note.deleteMany({ where: { id, workspaceId: context.workspace.id } });

    if (!deleted.count) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
