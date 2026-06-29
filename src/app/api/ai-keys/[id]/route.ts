import { NextResponse } from "next/server";

import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

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
    const deleted = await db.aiKey.deleteMany({ where: { id, userId: context.userId } });

    if (!deleted.count) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
