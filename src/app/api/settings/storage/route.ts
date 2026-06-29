import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";

const storageSettingsSchema = z.object({
  schedule: z.enum(["daily", "weekly"]),
});

export async function GET() {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const rawSettings =
      typeof context.workspace.settings === "object" && context.workspace.settings
        ? (context.workspace.settings as Record<string, unknown>)
        : {};

    const storageSettings = rawSettings.storage as { schedule?: string } | undefined;
    return NextResponse.json({ storage: { provider: "catalyst", schedule: storageSettings?.schedule || "weekly" } });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}

export async function PUT(request: Request) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const body = await request.json();
    const parsed = storageSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const currentSettings =
      typeof context.workspace.settings === "object" && context.workspace.settings
        ? (context.workspace.settings as Record<string, unknown>)
        : {};

    await db.workspace.update({
      where: { id: context.workspace.id },
      data: {
        settings: {
          ...currentSettings,
          storage: { provider: "catalyst", schedule: parsed.data.schedule },
        },
      },
    });

    return NextResponse.json({ storage: { provider: "catalyst", ...parsed.data } });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
