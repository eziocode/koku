import { NextResponse } from "next/server";

import { testProviderConnection } from "@/lib/ai/provider-tests";
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
      () => testProviderConnection(provider, apiKey),
      "performance",
      {
        provider,
      },
    );

    return NextResponse.json({ text: result });
  } catch (error) {
    return handleAiRouteError(error, "Unable to test AI provider.");
  }
}
