"use client";

/**
 * Dispatches a CLI connection to whichever transport can actually reach the
 * CLI: the loopback bridge daemon first (works even when Koku is deployed to
 * Zoho Catalyst), falling back to the same-host API route only when Koku
 * itself is being served from localhost.
 */

import { bridgeLogin, bridgeRun, bridgeStatus } from "@/lib/ai/cli/bridge-client";
import type { AiCliConfig } from "@/lib/storage/db";

export interface CliStatus {
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
}

function isLoopbackHost() {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function sameHostCall(cli: AiCliConfig, body: Record<string, unknown>) {
  const response = await fetch("/api/ai/cli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cliId: cli.cliId, ...body }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : "Local CLI request failed.";
    throw new Error(message);
  }

  return (await response.json()) as { text: string };
}

export async function cliStatus(cli: AiCliConfig): Promise<CliStatus> {
  if (cli.transport === "bridge") {
    return bridgeStatus(cli);
  }

  if (!isLoopbackHost()) {
    throw new Error("Same-host CLI mode requires Koku to be open on localhost.");
  }

  const result = await sameHostCall(cli, { action: "version" });
  return { installed: true, version: result.text.trim(), loggedIn: null };
}

export async function cliLogin(cli: AiCliConfig): Promise<string> {
  if (cli.transport === "bridge") {
    return (await bridgeLogin(cli)).text;
  }

  if (!isLoopbackHost()) {
    throw new Error("Same-host CLI mode requires Koku to be open on localhost.");
  }

  return (await sameHostCall(cli, { action: "login" })).text;
}

export async function cliRun(cli: AiCliConfig, prompt: string, options?: { signal?: AbortSignal }): Promise<ReadableStream<Uint8Array> | string> {
  if (cli.transport === "bridge") {
    return bridgeRun(cli, prompt, options);
  }

  if (!isLoopbackHost()) {
    throw new Error("Same-host CLI mode requires Koku to be open on localhost.");
  }

  return (await sameHostCall(cli, { action: "run", prompt })).text;
}
