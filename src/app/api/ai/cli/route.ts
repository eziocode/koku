import { execFile } from "node:child_process";

import { NextResponse } from "next/server";

import { AI_CLI_DETAILS, isKnownCli, isSafeExtraArg, MAX_EXTRA_ARGS } from "@/lib/ai/cli/cli-registry";
import { AiRequestError, handleAiRouteError, readAiJson } from "@/lib/ai/request-validation";
import { auditLogger } from "@/lib/audit/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXEC_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_BYTES = 200_000;

/**
 * Same-host fallback for local-CLI mode: only meaningful when Koku itself is
 * served from localhost (dev, or a self-hosted docker deployment). Off by
 * default so the Zoho Catalyst deployment can never reach a command-execution
 * surface, and loopback-gated as a second, independent check.
 */
function assertLocalCliEnabled(request: Request) {
  if (process.env.KOKU_ENABLE_LOCAL_CLI !== "1") {
    throw new AiRequestError(403, "Local CLI execution is disabled on this deployment.");
  }

  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new AiRequestError(403, "Local CLI execution is only available when Koku is served from localhost.");
  }
}

function parseCliId(value: unknown) {
  if (typeof value !== "string" || !isKnownCli(value)) {
    throw new AiRequestError(400, "Unknown CLI.");
  }
  return value;
}

function parseExtraArgs(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EXTRA_ARGS) {
    throw new AiRequestError(400, "Too many extra CLI arguments.");
  }
  return value.map((item) => {
    if (typeof item !== "string" || !isSafeExtraArg(item)) {
      throw new AiRequestError(400, "Extra CLI argument contains unsupported characters.");
    }
    return item;
  });
}

function runCli(binary: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(new AiRequestError(502, stderr?.trim() || error.message || "CLI execution failed."));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export async function POST(request: Request) {
  try {
    assertLocalCliEnabled(request);

    const body = await readAiJson(request);
    const action = typeof body.action === "string" ? body.action : "";
    const cliId = parseCliId(body.cliId);
    const details = AI_CLI_DETAILS[cliId];

    let args: string[];
    if (action === "status") {
      args = [...details.statusArgs];
    } else if (action === "version") {
      args = [...details.versionArgs];
    } else if (action === "login") {
      args = [...details.loginArgs];
    } else if (action === "run") {
      const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : "";
      if (!prompt) {
        throw new AiRequestError(400, "A prompt is required.");
      }
      args = [...details.execArgs(prompt), ...parseExtraArgs(body.extraArgs)];
    } else {
      throw new AiRequestError(400, "Unsupported CLI action.");
    }

    const text = await auditLogger.measure(
      "ai.cli.exec",
      () => runCli(details.binary, args),
      "performance",
      { cliId, action },
    );

    return NextResponse.json({ text });
  } catch (error) {
    return handleAiRouteError(error, "Unable to run the local CLI.");
  }
}
