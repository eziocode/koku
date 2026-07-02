import { generateText } from "ai";

import { buildModel, defaultModels, type AiProvider } from "@/lib/ai/providers";
import { AiRequestError } from "@/lib/ai/request-validation";

type GitHubModelsResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function getErrorText(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }

  const error = record.error;
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }

  return null;
}

async function readProviderError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return getErrorText(data) ?? fallback;
}

async function testGitHubModelsConnection(apiKey: string) {
  const response = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: defaultModels["github-copilot"],
      messages: [{ role: "user", content: "Reply with the single word: connected" }],
      max_tokens: 8,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const status = response.status >= 400 && response.status < 600 ? response.status : 502;
    const providerMessage = await readProviderError(
      response,
      "GitHub Models rejected the connection test.",
    );
    throw new AiRequestError(
      status,
      `${providerMessage} Confirm the token has models:read access and the ${defaultModels["github-copilot"]} model is enabled for the account or organization.`,
    );
  }

  const data = (await response.json().catch(() => null)) as GitHubModelsResponse | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new AiRequestError(502, "GitHub Models returned an unexpected connection test response.");
  }

  return text;
}

export async function testProviderConnection(provider: AiProvider, apiKey: string) {
  if (provider === "github-copilot") {
    return testGitHubModelsConnection(apiKey);
  }

  const result = await generateText({
    model: buildModel(provider, apiKey),
    prompt: "Reply with the single word: connected",
  });

  return result.text;
}
