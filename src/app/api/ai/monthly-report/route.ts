import { endOfMonth, startOfMonth } from "date-fns";
import { generateText } from "ai";
import { NextResponse } from "next/server";

import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { getAiProviderForUser } from "@/lib/ai/providers";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const body = await request.json().catch(() => ({}));
    const { model } = await getAiProviderForUser(context.userId, body.provider);
    const month = new Date();
    const entries = await db.timeEntry.findMany({
      where: {
        userId: context.userId,
        workspaceId: context.workspace.id,
        startAt: {
          gte: startOfMonth(month),
          lte: endOfMonth(month),
        },
      },
      include: { project: true, category: true },
      orderBy: { startAt: "asc" },
    });

   const prompt = `Write a reflective monthly work summary from these entries. Mention themes, momentum, and major initiatives.\n${entries
     .map((entry) => `- ${entry.title} | ${entry.project?.name || "Unassigned"} | ${entry.category?.name || "No category"} | ${entry.durationSec || 0}s`)
     .join("\n")}`;

    const result = await generateText({ model, prompt });
    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "Unable to generate monthly report.");
  }
}
