import { generateText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";
import {
  handleAiRouteError,
  parseApiKey,
  parseMonthlyEntries,
  parseProvider,
  readAiJson,
  type MonthlyEntry,
} from "@/lib/ai/request-validation";
import { auditLogger } from "@/lib/audit/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readAiJson(request);
    const provider = parseProvider(body.provider);
    const apiKey = parseApiKey(body.apiKey);
    const month = typeof body.month === "string" ? body.month : new Date().toISOString().slice(0, 7);
    const entries = parseMonthlyEntries(body.entries);

    const prompt = entries.length
      ? "Write a reflective monthly work summary for " + month + " from these entries. Mention themes, momentum, and major initiatives.\n" + entries
          .map((entry: MonthlyEntry) => {
            const notePart = entry.notes ? " | " + entry.notes : "";
            return "- " + entry.title + " | " + (entry.projectName || "Unassigned") + " | " + (entry.categoryName || "No category") + " | " + (entry.durationSec || 0) + "s" + notePart;
          })
          .join("\n")
      : "Write a reflective monthly work summary for " + month + ". Mention that there were no tracked entries for the month yet.";

    const result = await auditLogger.measure(
      "ai.monthly.generate",
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
    return handleAiRouteError(error, "Unable to generate monthly report.");
  }
}
