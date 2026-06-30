import { generateText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";

interface MonthlyEntry {
  title: string;
  projectName?: string;
  categoryName?: string;
  durationSec?: number | null;
  notes?: string | null;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      apiKey?: unknown;
      month?: unknown;
      entries?: unknown;
    };
    const provider = typeof body.provider === "string" ? body.provider : "openai";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const month = typeof body.month === "string" ? body.month : new Date().toISOString().slice(0, 7);
    const entries = Array.isArray(body.entries)
      ? body.entries.filter(
          (entry: unknown): entry is MonthlyEntry =>
            Boolean(entry) && typeof entry === "object" && typeof (entry as MonthlyEntry).title === "string",
        )
      : [];

    if (!apiKey) {
      return badRequest("API key is required.");
    }

    const prompt = entries.length
      ? "Write a reflective monthly work summary for " + month + " from these entries. Mention themes, momentum, and major initiatives.\n" + entries
          .map((entry: MonthlyEntry) => {
            const notePart = entry.notes ? " | " + entry.notes : "";
            return "- " + entry.title + " | " + (entry.projectName || "Unassigned") + " | " + (entry.categoryName || "No category") + " | " + (entry.durationSec || 0) + "s" + notePart;
          })
          .join("\n")
      : "Write a reflective monthly work summary for " + month + ". Mention that there were no tracked entries for the month yet.";

    const result = await generateText({
      model: buildModel(provider, apiKey),
      prompt,
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate monthly report." },
      { status: 500 },
    );
  }
}
