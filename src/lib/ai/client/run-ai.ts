"use client";

/**
 * Single entry point every chat-style AI surface in Koku goes through, so
 * neither `ai-workspace.tsx` nor the Koku AI panel need to branch on auth
 * mode themselves: API-key connections hit the existing `/api/ai/*` routes,
 * CLI connections go through the CLI transport (bridge or same-host).
 */

import { cliRun } from "@/lib/ai/cli/transport";
import type { AiKey } from "@/lib/storage/db";

export interface RunAiTextOptions {
  signal?: AbortSignal;
}

/**
 * Runs a single-shot prompt against `connection` and returns the full text.
 * `endpoint` and `body` describe the api-key request; `prompt` is what a CLI
 * connection receives instead, since a CLI has no notion of the app's typed
 * request bodies.
 */
export async function runAiText(
  connection: AiKey,
  request: { endpoint: string; body: Record<string, unknown>; prompt: string },
  options?: RunAiTextOptions,
): Promise<string> {
  if (connection.authMode === "api-key") {
    const response = await fetch(request.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
      body: JSON.stringify({ ...request.body, provider: connection.provider, apiKey: connection.apiKey }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "AI request failed.";
      throw new Error(message);
    }

    const data = await response.json();
    return typeof data.text === "string" ? data.text : "";
  }

  if (!connection.cli) {
    throw new Error("This connection is missing its CLI configuration.");
  }

  const result = await cliRun(connection.cli, request.prompt, options);
  return typeof result === "string" ? result : await new Response(result).text();
}
