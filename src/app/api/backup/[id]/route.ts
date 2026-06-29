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
    const backup = await db.backup.findFirst({ where: { id, userId: context.userId } });

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    return NextResponse.json(backup);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
