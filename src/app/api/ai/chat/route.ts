import { streamText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";

interface RequestMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestNote {
  title?: string;
  content?: unknown;
  tags?: string[];
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      apiKey?: unknown;
      messages?: unknown;
      notes?: unknown;
    };
    const provider = typeof body.provider === "string" ? body.provider : "openai";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (message: unknown): message is RequestMessage =>
            Boolean(message) &&
            typeof message === "object" &&
            typeof (message as RequestMessage).role === "string" &&
            typeof (message as RequestMessage).content === "string",
        )
      : [];
    const notes = Array.isArray(body.notes)
      ? body.notes.filter(
          (note: unknown): note is RequestNote => Boolean(note) && typeof note === "object",
        )
      : [];

    if (!apiKey) {
      return badRequest("API key is required.");
    }

    if (!messages.length) {
      return badRequest("At least one message is required.");
    }

    const noteContext = notes
      .slice(0, 8)
      .map((note: RequestNote) => {
        const title = typeof note.title === "string" ? note.title : "Untitled note";
        const tags = Array.isArray(note.tags) && note.tags.length ? " (" + note.tags.join(", ") + ")" : "";
        return title + tags + ": " + JSON.stringify(note.content).slice(0, 600);
      })
      .join("\n\n");

    const result = streamText({
      model: buildModel(provider, apiKey),
      system: noteContext
        ? "You are Koku's assistant. Use the following note context when it is helpful.\n\n" + noteContext
        : "You are Koku's assistant.",
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start AI chat." },
      { status: 500 },
    );
  }
}
