import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export const AI_PROVIDERS = ["openai", "anthropic", "google", "groq"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const defaultModels = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-2.5-flash",
  groq: "llama-3.1-70b-versatile",
} as const;

export function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}

export function buildModel(provider: AiProvider, apiKey: string) {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(defaultModels.anthropic);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(defaultModels.google);
    case "groq":
      return createOpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" })(defaultModels.groq);
    default:
      return createOpenAI({ apiKey })(defaultModels.openai);
  }
}
