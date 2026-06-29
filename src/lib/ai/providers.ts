import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

import { db } from "@/lib/db";
import { decryptValue } from "@/lib/encryption";

const defaultModels = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-2.5-flash",
  groq: "llama-3.1-70b-versatile",
} as const;

export async function getAiProviderForUser(userId: string, provider?: string) {
  const aiKey = provider
    ? await db.aiKey.findUnique({ where: { userId_provider: { userId, provider } } })
    : await db.aiKey.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });

  if (!aiKey) {
    throw new Error("No AI provider key found for this user.");
  }

  const apiKey = aiKey.encryptedKey ? decryptValue(aiKey.encryptedKey) : aiKey.oauthToken;

  if (!apiKey) {
    throw new Error(`No usable API key configured for ${aiKey.provider}.`);
  }

  switch (aiKey.provider) {
    case "anthropic":
      return {
        provider: aiKey.provider,
        model: createAnthropic({ apiKey })(defaultModels.anthropic),
      };
    case "google":
      return {
        provider: aiKey.provider,
        model: createGoogleGenerativeAI({ apiKey })(defaultModels.google),
      };
    case "groq":
      return {
        provider: aiKey.provider,
        model: createOpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" })(defaultModels.groq),
      };
    case "openai":
    default:
      return {
        provider: aiKey.provider,
        model: createOpenAI({ apiKey })(defaultModels.openai),
      };
  }
}
