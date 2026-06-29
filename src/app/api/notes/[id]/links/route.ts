import { NextResponse } from "next/server";

import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

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

    // Verify the note belongs to the authenticated user's workspace before exposing links.
    const note = await db.note.findFirst({
      where: { id, workspaceId: context.workspace.id },
      select: { id: true },
    });

    if (!note) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const links = await db.noteLink.findMany({
      where: { sourceNoteId: id },
      include: {
        targetNote: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    return NextResponse.json(links.map((link) => link.targetNote));
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
