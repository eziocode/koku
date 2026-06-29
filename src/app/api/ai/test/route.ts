import { generateText } from "ai";
import { NextResponse } from "next/server";

import { badRequest, requireUserContext, serverError, unauthorized } from "@/lib/api";
import { getAiProviderForUser } from "@/lib/ai/providers";

export async function POST(request: Request) {
  try {
    const context = await requireUserContext();
    if (!context) {
      return unauthorized();
    }

    const body = await request.json().catch(() => ({}));
    const provider = typeof body.provider === "string" ? body.provider : undefined;

    if (!provider) {
      return badRequest({ provider: ["Provider is required."] });
    }

    const { model } = await getAiProviderForUser(context.userId, provider);
    const result = await generateText({
      model,
      prompt: "Reply with the single word: connected",
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error(error);
    return serverError(error instanceof Error ? error.message : "Unable to test AI provider.");
  }
}
