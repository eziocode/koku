import { generateText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";
import {
  handleAiRouteError,
  parseApiKey,
  parseProvider,
  parseStandupEntries,
  readAiJson,
  type StandupEntry,
} from "@/lib/ai/request-validation";
import { auditLogger } from "@/lib/audit/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readAiJson(request);
    const provider = parseProvider(body.provider);
    const apiKey = parseApiKey(body.apiKey);
    const entries = parseStandupEntries(body.entries);

    const prompt = entries.length
      ? "Create a concise daily standup in first person from these time entries:\n" + entries
          .map(
            (entry: StandupEntry) =>
              "- " + entry.title + " (" + (entry.projectName || "Unassigned") + ", " + (entry.durationSec || 0) + "s)",
          )
          .join("\n")
      : "Create a concise daily standup in first person. Mention that no work was tracked today yet.";

    const result = await auditLogger.measure(
      "ai.standup.generate",
      () => generateText({
        model: buildModel(provider, apiKey),
        prompt,
      }),
      "performance",
      {
        provider,
        entries: entries.length,
      },
    );

    return NextResponse.json({ text: result.text });
  } catch (error) {
    return handleAiRouteError(error, "Unable to generate standup.");
  }
}
