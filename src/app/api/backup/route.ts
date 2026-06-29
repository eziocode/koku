import { NextResponse } from "next/server";

import { createUserBackup } from "@/lib/backup/backup";
import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const backup = await db.backup.create({
      data: {
        userId: context.userId,
        storageProvider: "catalyst",
        path: "queued",
        status: "queued",
      },
    });

    await createUserBackup({ backupId: backup.id, userId: context.userId });

    return NextResponse.json({ id: backup.id, status: "completed" }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "Unable to trigger backup.");
  }
}
