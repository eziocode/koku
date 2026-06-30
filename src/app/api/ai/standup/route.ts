import { generateText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";

interface StandupEntry {
  title: string;
  projectName?: string;
  durationSec?: number | null;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      apiKey?: unknown;
      entries?: unknown;
    };
    const provider = typeof body.provider === "string" ? body.provider : "openai";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const entries = Array.isArray(body.entries)
      ? body.entries.filter(
          (entry: unknown): entry is StandupEntry =>
            Boolean(entry) && typeof entry === "object" && typeof (entry as StandupEntry).title === "string",
        )
      : [];

    if (!apiKey) {
      return badRequest("API key is required.");
    }

    const prompt = entries.length
      ? "Create a concise daily standup in first person from these time entries:\n" + entries
          .map(
            (entry: StandupEntry) =>
              "- " + entry.title + " (" + (entry.projectName || "Unassigned") + ", " + (entry.durationSec || 0) + "s)",
          )
          .join("\n")
      : "Create a concise daily standup in first person. Mention that no work was tracked today yet.";

    const result = await generateText({
      model: buildModel(provider, apiKey),
      prompt,
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate standup." },
      { status: 500 },
    );
  }
}
