import { PgBoss } from "pg-boss";
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

    const settings =
      typeof context.workspace.settings === "object" && context.workspace.settings
        ? ((context.workspace.settings as Record<string, unknown>).storage as
            | { provider?: string }
            | undefined)
        : undefined;
    const provider = settings?.provider || "s3";

    const backup = await db.backup.create({
      data: {
        userId: context.userId,
        storageProvider: provider,
        path: "queued",
        status: "queued",
      },
    });

    if (process.env.DATABASE_URL) {
      try {
        const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
        await boss.start();
        await boss.send("koku-backups", {
          backupId: backup.id,
          userId: context.userId,
          provider,
        });
        await boss.stop();
        // Successfully queued — return early; the worker will run the actual backup.
        return NextResponse.json({ id: backup.id, status: "queued" }, { status: 201 });
      } catch (queueError) {
        console.warn("pg-boss queueing failed, falling back to inline backup", queueError);
      }
    }

    // No DATABASE_URL or queue failed — run the backup inline as a fallback.
    await createUserBackup({ backupId: backup.id, userId: context.userId, provider });

    return NextResponse.json({ id: backup.id, status: "completed" }, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "Unable to trigger backup.");
  }
}
