import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export const defaultModels = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-2.5-flash",
  groq: "llama-3.1-70b-versatile",
} as const;

export function buildModel(provider: string, apiKey: string) {
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
