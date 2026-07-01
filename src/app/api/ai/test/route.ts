import { generateText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";
import {
  handleAiRouteError,
  parseApiKey,
  parseProvider,
  readAiJson,
} from "@/lib/ai/request-validation";
import { auditLogger } from "@/lib/audit/logger";

export async function POST(request: Request) {
  try {
    const body = await readAiJson(request);
    const provider = parseProvider(body.provider);
    const apiKey = parseApiKey(body.apiKey);

    const result = await auditLogger.measure(
      "ai.provider.test",
      () => generateText({
        model: buildModel(provider, apiKey),
        prompt: "Reply with the single word: connected",
      }),
      "performance",
      {
        provider,
      },
    );

    return NextResponse.json({ text: result.text });
  } catch (error) {
    return handleAiRouteError(error, "Unable to test AI provider.");
  }
}
