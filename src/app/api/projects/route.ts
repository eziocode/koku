import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectSchema } from "@/lib/validations/time-entry";

export async function GET() {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const projects = await db.project.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(projects);
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
    const parsed = projectSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const project = await db.project.create({
      data: {
        workspaceId: context.workspace.id,
        ...parsed.data,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
