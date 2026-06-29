import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { encryptValue } from "@/lib/encryption";

const aiKeySchema = z.object({
  provider: z.enum(["openai", "anthropic", "google", "groq"]),
  apiKey: z.string().min(10),
});

export async function GET() {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const keys = await db.aiKey.findMany({
      where: { userId: context.userId },
      select: { id: true, provider: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(keys);
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
    const parsed = aiKeySchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten());
    }

    const aiKey = await db.aiKey.upsert({
      where: {
        userId_provider: {
          userId: context.userId,
          provider: parsed.data.provider,
        },
      },
      update: {
        encryptedKey: encryptValue(parsed.data.apiKey),
      },
      create: {
        userId: context.userId,
        provider: parsed.data.provider,
        encryptedKey: encryptValue(parsed.data.apiKey),
      },
      select: { id: true, provider: true, createdAt: true },
    });

    return NextResponse.json(aiKey, { status: 201 });
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
