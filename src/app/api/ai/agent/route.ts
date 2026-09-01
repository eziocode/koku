import { streamText } from "ai";

import { KOKU_ACTION_SYSTEM_PROMPT } from "@/lib/ai/agent/actions";
import { buildModel } from "@/lib/ai/providers";
import {
  AiRequestError,
  handleAiRouteError,
  parseApiKey,
  parseMessages,
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

    if (!messages.length) {
      throw new AiRequestError(400, "At least one message is required.");
    }

    const result = await auditLogger.measure(
      "ai.agent.stream.start",
      () => streamText({
        model: buildModel(provider, apiKey),
        system: KOKU_ACTION_SYSTEM_PROMPT,
        messages,
      }),
      "performance",
      {
        provider,
        messages: messages.length,
      },
    );

    return result.toTextStreamResponse();
  } catch (error) {
    return handleAiRouteError(error, "Unable to start Koku AI.");
  }
}
