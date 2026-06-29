import { endOfDay, parseISO, startOfDay } from "date-fns";
import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { timeEntryFilterSchema, timeEntrySchema } from "@/lib/validations/time-entry";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const url = new URL(request.url);
    const parsed = timeEntryFilterSchema.safeParse({
      date: url.searchParams.get("date") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      categoryId: url.searchParams.get("categoryId") || undefined,
      search: url.searchParams.get("search") || undefined,
    });

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const where: Record<string, unknown> = {
      userId: context.userId,
      workspaceId: context.workspace.id,
    };

    if (parsed.data.date) {
      const day = parseISO(parsed.data.date);
      where.startAt = {
        gte: startOfDay(day),
        lte: endOfDay(day),
      };
    }

    if (parsed.data.from || parsed.data.to) {
      where.startAt = {
        gte: parsed.data.from ? new Date(parsed.data.from) : undefined,
        lte: parsed.data.to ? new Date(parsed.data.to) : undefined,
      };
    }

    if (parsed.data.projectId) {
      where.projectId = parsed.data.projectId;
    }

    if (parsed.data.categoryId) {
      where.categoryId = parsed.data.categoryId;
    }

    if (parsed.data.search) {
      where.title = { contains: parsed.data.search, mode: "insensitive" };
    }

    const entries = await db.timeEntry.findMany({
      where,
      include: {
        project: true,
        category: true,
      },
      orderBy: { startAt: "desc" },
    });

    return NextResponse.json(entries);
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
    const parsed = timeEntrySchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const startAt = new Date(parsed.data.startAt);
    const endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;
    const durationSec =
      parsed.data.durationSec ??
      (endAt ? Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 1000)) : null);

    const entry = await db.timeEntry.create({
      data: {
        userId: context.userId,
        workspaceId: context.workspace.id,
        title: parsed.data.title,
        projectId: parsed.data.projectId || null,
        categoryId: parsed.data.categoryId || null,
        startAt,
        endAt,
        durationSec,
        tags: parsed.data.tags,
        notes: parsed.data.notes || null,
      },
      include: {
        project: true,
        category: true,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
