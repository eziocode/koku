import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { categorySchema } from "@/lib/validations/time-entry";

export async function GET() {
  try {
    const context = await requireUserContext();

    if (!context) {
      return unauthorized();
    }

    const categories = await db.category.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(categories);
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
    const parsed = categorySchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const category = await db.category.create({
      data: {
        workspaceId: context.workspace.id,
        ...parsed.data,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
