import { streamText } from "ai";

import { buildModel } from "@/lib/ai/providers";
import {
  AiRequestError,
  handleAiRouteError,
  parseApiKey,
  parseMessages,
  parseNotes,
  parseProvider,
  readAiJson,
} from "@/lib/ai/request-validation";
import { auditLogger } from "@/lib/audit/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readAiJson(request);
    const provider = parseProvider(body.provider);
    const apiKey = parseApiKey(body.apiKey);
    const messages = parseMessages(body.messages);
    const notes = parseNotes(body.notes);

    if (!messages.length) {
      throw new AiRequestError(400, "At least one message is required.");
    }

    const noteContext = notes
      .map((note) => {
        const tags = note.tags.length ? " (" + note.tags.join(", ") + ")" : "";
        return note.title + tags + ": " + note.contentPreview;
      })
      .join("\n\n");

    const result = await auditLogger.measure(
      "ai.chat.stream.start",
      () => streamText({
        model: buildModel(provider, apiKey),
        system: noteContext
          ? "You are Koku's assistant. Use the following note context when it is helpful.\n\n" + noteContext
          : "You are Koku's assistant.",
        messages,
      }),
      "performance",
      {
        provider,
        messages: messages.length,
        notes: notes.length,
      },
    );

    return result.toTextStreamResponse();
  } catch (error) {
    return handleAiRouteError(error, "Unable to start AI chat.");
  }
}
