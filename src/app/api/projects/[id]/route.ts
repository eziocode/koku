import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectUpdateSchema } from "@/lib/validations/time-entry";

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
    const parsed = projectUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const { id } = await params;
    const project = await db.project.updateMany({
      where: { id, workspaceId: context.workspace.id },
      data: parsed.data,
    });

    if (!project.count) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updated = await db.project.findUnique({ where: { id } });
    return NextResponse.json(updated);
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
    const deleted = await db.project.deleteMany({
      where: { id, workspaceId: context.workspace.id },
    });

    if (!deleted.count) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
