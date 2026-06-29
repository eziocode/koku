import { endOfDay, startOfDay } from "date-fns";
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
    const today = new Date();
    const entries = await db.timeEntry.findMany({
      where: {
        userId: context.userId,
        workspaceId: context.workspace.id,
        startAt: {
          gte: startOfDay(today),
          lte: endOfDay(today),
        },
      },
      include: { project: true },
      orderBy: { startAt: "asc" },
    });

   const prompt = `Create a concise daily standup in first person from these time entries:\n${entries
     .map((entry) => `- ${entry.title} (${entry.project?.name || "Unassigned"}, ${entry.durationSec || 0}s)`)
     .join("\n")}`;

   const result = await generateText({ model, prompt });
    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "Unable to generate standup.");
  }
}
