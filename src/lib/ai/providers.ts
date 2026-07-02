import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export const AI_PROVIDER_DETAILS = {
  openai: {
    label: "OpenAI",
    credentialLabel: "OpenAI API key",
    credentialPlaceholder: "sk-...",
    description: "Use an OpenAI platform API key for general chat workflows.",
  },
  "openai-codex": {
    label: "OpenAI Codex",
    credentialLabel: "OpenAI API key",
    credentialPlaceholder: "sk-...",
    description:
      "Uses an OpenAI platform API key for Codex-capable coding workflows. For ChatGPT account login, use the local Codex CLI login flow instead of pasting a ChatGPT password or session token.",
  },
  anthropic: {
    label: "Anthropic",
    credentialLabel: "Anthropic API key",
    credentialPlaceholder: "sk-ant-...",
    description: "Use an Anthropic API key for Claude-backed workflows.",
  },
  google: {
    label: "Google Gemini",
    credentialLabel: "Gemini API key",
    credentialPlaceholder: "AIza...",
    description: "Use a Google AI Studio/Gemini API key.",
  },
  groq: {
    label: "Groq",
    credentialLabel: "Groq API key",
    credentialPlaceholder: "gsk_...",
    description: "Use a Groq API key through its OpenAI-compatible endpoint.",
  },
  "github-copilot": {
    label: "GitHub Models / Copilot",
    credentialLabel: "GitHub token",
    credentialPlaceholder: "ghp_...",
    description:
      "Uses GitHub Models' OpenAI-compatible endpoint with a GitHub token that has models:read access.",
  },
} as const;

export const AI_PROVIDERS = Object.keys(AI_PROVIDER_DETAILS) as Array<keyof typeof AI_PROVIDER_DETAILS>;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const defaultModels = {
  openai: "gpt-4o-mini",
  "openai-codex": "codex-mini-latest",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-2.5-flash",
  groq: "llama-3.1-70b-versatile",
  "github-copilot": "openai/gpt-4.1",
} as const;

export function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}

export function buildModel(provider: AiProvider, apiKey: string) {
  switch (provider) {
    case "openai-codex":
      return createOpenAI({ apiKey })(defaultModels["openai-codex"]);
    case "anthropic":
      return createAnthropic({ apiKey })(defaultModels.anthropic);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(defaultModels.google);
    case "groq":
      return createOpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" })(defaultModels.groq);
    case "github-copilot":
      return createOpenAI({ apiKey, baseURL: "https://models.github.ai/inference" })(
        defaultModels["github-copilot"],
      );
    default:
      return createOpenAI({ apiKey })(defaultModels.openai);
  }
}
