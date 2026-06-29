import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { timeEntryUpdateSchema } from "@/lib/validations/time-entry";

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

    const entry = await db.timeEntry.findFirst({
      where: {
        id,
        userId: context.userId,
        workspaceId: context.workspace.id,
      },
      include: {
        project: true,
        category: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json(entry);
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
    const parsed = timeEntryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const { id } = await params;
    const existing = await db.timeEntry.findFirst({
      where: {
        id,
        userId: context.userId,
        workspaceId: context.workspace.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const nextStartAt = parsed.data.startAt
      ? new Date(parsed.data.startAt)
      : existing.startAt;
    const nextEndAt =
      parsed.data.endAt !== undefined
        ? parsed.data.endAt
          ? new Date(parsed.data.endAt)
          : null
        : existing.endAt;
    const nextDuration =
      parsed.data.durationSec !== undefined
        ? parsed.data.durationSec
        : nextEndAt
          ? Math.max(0, Math.floor((nextEndAt.getTime() - nextStartAt.getTime()) / 1000))
          : existing.durationSec;

    const entry = await db.timeEntry.updateMany({
      where: {
        id,
        userId: context.userId,
        workspaceId: context.workspace.id,
      },
      data: {
        title: parsed.data.title,
        projectId:
          parsed.data.projectId !== undefined ? parsed.data.projectId : undefined,
        categoryId:
          parsed.data.categoryId !== undefined ? parsed.data.categoryId : undefined,
        startAt: parsed.data.startAt ? nextStartAt : undefined,
        endAt:
          parsed.data.endAt !== undefined
            ? nextEndAt
            : undefined,
        durationSec: nextDuration,
        tags: parsed.data.tags ?? undefined,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : undefined,
      },
    });

    if (!entry.count) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const updated = await db.timeEntry.findUnique({
      where: { id },
      include: { project: true, category: true },
    });

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
    const result = await db.timeEntry.deleteMany({
      where: {
        id,
        userId: context.userId,
        workspaceId: context.workspace.id,
      },
    });

    if (!result.count) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
