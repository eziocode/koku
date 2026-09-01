"use client";

/**
 * Talks to the local koku-bridge daemon (see tools/koku-bridge) over
 * loopback HTTP. This is the "bridge" transport: it works even when Koku
 * itself is served from Zoho Catalyst, because the bridge runs on the
 * user's own machine and the browser calls it directly.
 */

import type { AiCliConfig } from "@/lib/storage/db";

export class BridgeError extends Error {}

function headers(cli: AiCliConfig) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cli.bridgeToken}`,
  };
}

export async function bridgeStatus(cli: AiCliConfig) {
  const response = await fetch(`${cli.bridgeUrl}/status`, {
    method: "POST",
    headers: headers(cli),
    body: JSON.stringify({ cliId: cli.cliId }),
  });

  if (!response.ok) {
    throw new BridgeError(`Bridge status check failed (${response.status}).`);
  }

  return (await response.json()) as { installed: boolean; version: string | null; loggedIn: boolean | null };
}

export async function bridgeLogin(cli: AiCliConfig) {
  const response = await fetch(`${cli.bridgeUrl}/login`, {
    method: "POST",
    headers: headers(cli),
    body: JSON.stringify({ cliId: cli.cliId }),
  });

  if (!response.ok) {
    throw new BridgeError(`Bridge login failed (${response.status}).`);
  }

  return (await response.json()) as { text: string };
}

export async function bridgeRun(cli: AiCliConfig, prompt: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`${cli.bridgeUrl}/run`, {
    method: "POST",
    headers: headers(cli),
    signal: options?.signal,
    body: JSON.stringify({ cliId: cli.cliId, prompt, extraArgs: cli.extraArgs }),
  });

  if (!response.ok || !response.body) {
    throw new BridgeError(`Bridge run failed (${response.status}).`);
  }

  return response.body;
}
