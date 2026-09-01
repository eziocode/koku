"use client";

import { FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { AI_CLI_DETAILS, AI_CLI_IDS, isKnownCli, type AiCliId } from "@/lib/ai/cli/cli-registry";
import { cliLogin, cliStatus } from "@/lib/ai/cli/transport";
import { AI_PROVIDER_DETAILS, AI_PROVIDERS } from "@/lib/ai/providers";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import type { AiAuthMode, AiCliConfig, AiKey } from "@/lib/storage/db";

const AUTH_MODE_LABEL: Record<AiAuthMode, string> = {
  "api-key": "AI key",
  cli: "Local CLI",
  "org-cli": "Org login (via CLI)",
};

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4319";

async function getResponseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }

  return fallback;
}

function providersForMode(mode: AiAuthMode) {
  return AI_PROVIDERS.filter((value) => (AI_PROVIDER_DETAILS[value].authModes as readonly AiAuthMode[]).includes(mode));
}

function KeyEditor({ onSaved }: { onSaved: () => void }) {
  const { saveConnection } = useAiKeys();
  const [mode, setMode] = useState<AiAuthMode>("api-key");
  const [provider, setProvider] = useState<string>(providersForMode("api-key")[0]);
  const [apiKey, setApiKey] = useState("");
  const [cliId, setCliId] = useState<AiCliId>(AI_CLI_IDS[0]);
  const [extraArgsText, setExtraArgsText] = useState("");
  const [transport, setTransport] = useState<AiCliConfig["transport"]>("bridge");
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [bridgeToken, setBridgeToken] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const providerDetails =
    AI_PROVIDER_DETAILS[provider as keyof typeof AI_PROVIDER_DETAILS] ?? AI_PROVIDER_DETAILS[providersForMode("api-key")[0]];
  const cliDetails = AI_CLI_DETAILS[cliId] ?? AI_CLI_DETAILS[AI_CLI_IDS[0]];

  function handleModeChange(nextMode: AiAuthMode) {
    setMode(nextMode);
    const options = providersForMode(nextMode);
    if (!(options as readonly string[]).includes(provider)) {
      setProvider(options[0]);
    }
    setDetectedVersion(null);
  }

  function buildCliConfig(): AiCliConfig {
    return {
      cliId,
      extraArgs: extraArgsText
        .split(/\s+/)
        .map((arg) => arg.trim())
        .filter(Boolean),
      transport,
      bridgeUrl,
      bridgeToken,
    };
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      const status = await cliStatus(buildCliConfig());
      setDetectedVersion(status.installed ? status.version ?? "detected" : null);
      if (status.installed) {
        toast.success(`${cliDetails.label} detected: ${status.version ?? "unknown version"}.`);
      } else {
        toast.error(`${cliDetails.label} was not found.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reach the CLI.");
    } finally {
      setDetecting(false);
    }
  }

  async function handleLogin() {
    setLoggingIn(true);
    try {
      await cliLogin(buildCliConfig());
      toast.success(`${cliDetails.label} login flow started. Follow the prompts in your terminal.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start CLI login.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (mode === "api-key") {
        await saveConnection({ provider, authMode: "api-key", apiKey });
      } else {
        await saveConnection({ provider: cliDetails.provider, authMode: mode, cli: buildCliConfig() });
      }
      toast.success("AI connection saved. Run Test connection to verify it.");
      onSaved();
    } catch {
      toast.error("Unable to save AI connection.");
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label>Connection type</Label>
        <Select
          value={mode}
          onValueChange={(value) => {
            if (value === "api-key" || value === "cli" || value === "org-cli") handleModeChange(value);
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="api-key">AI key</SelectItem>
            <SelectItem value="cli">Local CLI</SelectItem>
            <SelectItem value="org-cli">Org login (via CLI)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === "api-key"
            ? "Store a provider-issued API key locally in your browser."
            : mode === "cli"
              ? "Drive a CLI already installed on your machine, using whatever credential it already has."
              : "Sign in through the CLI's own org or subscription login. Koku stores no credential for this mode."}
        </p>
      </div>

      {mode === "api-key" ? (
        <>
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(value) => { if (value) setProvider(value); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {providersForMode("api-key").map((value) => (
                  <SelectItem key={value} value={value}>
                    {AI_PROVIDER_DETAILS[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{providerDetails.description}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key">{providerDetails.credentialLabel}</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={providerDetails.credentialPlaceholder}
              required
            />
            <p className="text-xs text-muted-foreground">
              Koku never asks for ChatGPT, OpenAI, or GitHub passwords. Store only API tokens that the provider explicitly issues for third-party apps.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label>CLI</Label>
            <Select
              value={cliId}
              onValueChange={(value) => {
                // Radix's hidden bubble-<select> (used for native form
                // integration) can fire a change event with "" the instant
                // this Select mounts, before its real value settles. Ignore
                // anything that isn't one of our known CLI ids.
                if (isKnownCli(value)) {
                  setCliId(value);
                  setDetectedVersion(null);
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_CLI_IDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {AI_CLI_DETAILS[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{cliDetails.description}</p>
          </div>

          <div className="space-y-2">
            <Label>Transport</Label>
            <Select
              value={transport}
              onValueChange={(value) => {
                if (value === "bridge" || value === "same-host") setTransport(value);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bridge">Local bridge (recommended)</SelectItem>
                <SelectItem value="same-host">Same host (Koku running on localhost)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The bridge is a small local daemon that lets Koku reach this CLI even when Koku itself is hosted
              elsewhere. Download it from{" "}
              <a href="/downloads/koku-bridge/index.mjs" className="underline" download>
                downloads/koku-bridge
              </a>{" "}
              and run <code className="rounded bg-background px-1 py-0.5">node index.mjs</code>.
            </p>
          </div>

          {transport === "bridge" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bridge-url">Bridge URL</Label>
                <Input id="bridge-url" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bridge-token">Bridge token</Label>
                <Input
                  id="bridge-token"
                  type="password"
                  value={bridgeToken}
                  onChange={(event) => setBridgeToken(event.target.value)}
                  placeholder="Printed when the bridge starts"
                  required
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="extra-args">Extra CLI arguments (optional, space-separated)</Label>
            <Input id="extra-args" value={extraArgsText} onChange={(event) => setExtraArgsText(event.target.value)} placeholder="--model gpt-5" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleDetect} disabled={detecting}>
              {detecting ? "Detecting…" : "Detect CLI"}
            </Button>
            {mode === "org-cli" ? (
              <Button type="button" variant="outline" onClick={handleLogin} disabled={loggingIn}>
                {loggingIn ? "Starting login…" : "Sign in"}
              </Button>
            ) : null}
            {detectedVersion ? <Badge variant="secondary">{detectedVersion}</Badge> : null}
          </div>

          <p className="rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {mode === "org-cli"
              ? "Sign-in runs the CLI's own login command in your terminal. Koku never asks for or stores a ChatGPT, Claude, or GitHub password."
              : "This mode runs your local CLI with whatever credential it already has configured."}
          </p>
        </>
      )}

      <Button type="submit">Save connection</Button>
    </form>
  );
}

function connectionSubtitle(key: AiKey) {
  if (key.authMode === "api-key") return "API key";
  const cliLabel = key.cli ? AI_CLI_DETAILS[key.cli.cliId as AiCliId]?.label ?? key.cli.cliId : "CLI";
  return key.authMode === "org-cli" ? `Org login via ${cliLabel}` : `Local CLI: ${cliLabel}`;
}

export function AiKeyManager() {
  const { aiKeys, verifiedConnections, deleteAiKey, getApiKeyForProvider, markVerified } = useAiKeys();
  const { value: kokuAi, patchValue: patchKokuAi } = useTypedSetting("kokuAi");
  const [open, setOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    try {
      await deleteAiKey(id);
      toast.success("AI connection removed.");
    } catch {
      toast.error("Unable to delete connection.");
    }
  }

  async function handleTest(key: AiKey) {
    setTestingId(key.id);

    try {
      if (key.authMode === "api-key") {
        const apiKey = await getApiKeyForProvider(key.provider);
        if (!apiKey) {
          toast.error("No credential stored for this provider.");
          return;
        }

        const response = await fetch("/api/ai/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: key.provider, apiKey }),
        });

        if (!response.ok) {
          toast.error(await getResponseError(response, "Connection test failed."));
          return;
        }
      } else {
        if (!key.cli) {
          toast.error("This connection is missing its CLI configuration.");
          return;
        }
        const status = await cliStatus(key.cli);
        if (!status.installed) {
          toast.error(`${AI_CLI_DETAILS[key.cli.cliId as AiCliId]?.label ?? key.cli.cliId} was not found.`);
          return;
        }
      }

      await markVerified(key.id);
      toast.success("Connection successful.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reach the connection test endpoint.");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">AI Keys</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Provider credentials</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Connect OpenAI, Codex, Anthropic, Gemini, Groq, or GitHub Models-backed workflows using an API key, a local
          CLI, or an org/subscription login handled entirely by that CLI.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add AI connection</Button>
          </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add AI connection</DialogTitle>
            <DialogDescription>Credentials and CLI settings stay in your local browser database.</DialogDescription>
          </DialogHeader>
          <KeyEditor onSaved={() => setOpen(false)} />
        </DialogContent>
        </Dialog>
        {verifiedConnections.length && kokuAi.dismissed ? (
          <Button variant="outline" onClick={() => void patchKokuAi({ dismissed: false })}>
            Show Koku AI launcher
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {aiKeys.map((key) => (
          <Card key={key.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{AI_PROVIDER_DETAILS[key.provider as keyof typeof AI_PROVIDER_DETAILS]?.label ?? key.provider}</span>
                <Badge variant="outline">{AUTH_MODE_LABEL[key.authMode]}</Badge>
              </CardTitle>
              <CardDescription>
                {connectionSubtitle(key)} · Added {new Date(key.createdAt).toLocaleDateString()}
                {key.lastVerifiedAt ? ` · Verified ${new Date(key.lastVerifiedAt).toLocaleDateString()}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleTest(key)}
                disabled={testingId === key.id}
              >
                {testingId === key.id ? "Testing…" : "Test connection"}
              </Button>
              <Button variant="ghost" onClick={() => handleDelete(key.id)}>Delete</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
