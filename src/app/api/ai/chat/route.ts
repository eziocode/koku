import { streamText } from "ai";

import { requireUserContext, serverError, unauthorized } from "@/lib/api";
import { getAiProviderForUser } from "@/lib/ai/providers";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const body = await request.json();
    const { model } = await getAiProviderForUser(context.userId, body.provider);
    const notes = await db.note.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { title: true, content: true, tags: true },
    });

    const noteContext = notes
      .map((note) => `${note.title} (${note.tags.join(", ")}): ${JSON.stringify(note.content).slice(0, 600)}`)
      .join("\\n\\n");

    const result = streamText({
      model,
      system: `You are Koku's assistant. Use the following note context when answering.\\n\\n${noteContext}`,
      messages: (body.messages || []).map((message: { role: string; content: string }) => ({
        role: message.role,
        content: message.content,
      })),
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "Unable to start AI chat.");
  }
}
