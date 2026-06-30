import { generateText } from "ai";
import { NextResponse } from "next/server";

import { buildModel } from "@/lib/ai/providers";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = typeof body.provider === "string" ? body.provider : "openai";
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!apiKey) {
      return badRequest("API key is required.");
    }

    const result = await generateText({
      model: buildModel(provider, apiKey),
      prompt: "Reply with the single word: connected",
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to test AI provider." },
      { status: 500 },
    );
  }
}
