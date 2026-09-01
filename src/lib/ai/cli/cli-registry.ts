/**
 * Local AI CLIs Koku knows how to drive, either as a plain local-CLI
 * connection or (via loginArgs) to bridge an org/subscription login that
 * Koku itself never sees a credential for. Mirrors the shape of
 * AI_PROVIDER_DETAILS in `@/lib/ai/providers` on purpose: same lookup
 * pattern, same "label the option, drive it by id" contract.
 */

import type { AiProvider } from "@/lib/ai/providers";

export const AI_CLI_DETAILS = {
  codex: {
    label: "Codex CLI",
    binary: "codex",
    provider: "openai-codex" as AiProvider,
    loginArgs: ["login"],
    statusArgs: ["login", "status"],
    versionArgs: ["--version"],
    execArgs: (prompt: string) => ["exec", "--json", prompt],
    description: "Drives the local `codex` CLI. Org login uses `codex login`; Koku never sees the token.",
  },
  claude: {
    label: "Claude Code",
    binary: "claude",
    provider: "anthropic" as AiProvider,
    loginArgs: ["setup-token"],
    statusArgs: ["--version"],
    versionArgs: ["--version"],
    execArgs: (prompt: string) => ["-p", prompt, "--output-format", "text"],
    description: "Drives the local `claude` CLI. Org login uses `claude setup-token`.",
  },
  copilot: {
    label: "GitHub Copilot CLI",
    binary: "copilot",
    provider: "github-copilot" as AiProvider,
    loginArgs: ["auth", "login"],
    statusArgs: ["auth", "status"],
    versionArgs: ["--version"],
    execArgs: (prompt: string) => ["-p", prompt],
    description: "Drives the local `copilot` CLI. Org login uses `copilot auth login`.",
  },
} as const;

export type AiCliId = keyof typeof AI_CLI_DETAILS;
export const AI_CLI_IDS = Object.keys(AI_CLI_DETAILS) as AiCliId[];

export function isKnownCli(value: string): value is AiCliId {
  return Object.prototype.hasOwnProperty.call(AI_CLI_DETAILS, value);
}

/**
 * Conservative allowlist for user-supplied extra CLI args: no shell
 * metacharacters, no whitespace, so an arg can never smuggle a second
 * command past `execFile`'s argv array.
 */
export const EXTRA_ARG_PATTERN = /^[A-Za-z0-9._/=@:-]+$/;
export const MAX_EXTRA_ARGS = 8;
export const MAX_EXTRA_ARG_LENGTH = 200;

export function isSafeExtraArg(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EXTRA_ARG_LENGTH && EXTRA_ARG_PATTERN.test(value);
}
