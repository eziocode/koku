import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { decryptValue, encryptValue } from "@/lib/encryption";

const storageSettingsSchema = z.object({
  provider: z.enum(["google-drive", "onedrive", "dropbox", "s3"]),
  schedule: z.enum(["daily", "weekly"]),
  credentials: z.string(),
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

    // Decrypt credentials before returning so the client can display/use them.
    const storageSettings = rawSettings.storage as
      | { provider?: string; schedule?: string; credentials?: string }
      | undefined;

    const safeSettings = storageSettings
      ? {
          ...storageSettings,
          credentials: storageSettings.credentials
            ? decryptValue(storageSettings.credentials)
            : "",
        }
      : {};

    return NextResponse.json({ storage: safeSettings });
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

    const workspace = await db.workspace.update({
      where: { id: context.workspace.id },
      data: {
        settings: {
          ...currentSettings,
          storage: {
            ...parsed.data,
            // Encrypt credentials at rest; decrypt on read in the GET handler.
            credentials: parsed.data.credentials
              ? encryptValue(parsed.data.credentials)
              : "",
          },
        },
      },
    });

    // Return the plain-text input (not the stored encrypted form) so the client
    // can update its local state without needing another GET.
    return NextResponse.json({ storage: parsed.data });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
