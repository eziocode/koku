"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { AI_PROVIDER_DETAILS, AI_PROVIDERS } from "@/lib/ai/providers";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";

function KeyEditor({ onSaved }: { onSaved: () => void }) {
  const { saveAiKey } = useAiKeys();
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const providerDetails = AI_PROVIDER_DETAILS[provider as keyof typeof AI_PROVIDER_DETAILS];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await saveAiKey(provider, apiKey);
      toast.success("AI key saved.");
      onSaved();
    } catch {
      toast.error("Unable to save AI key.");
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((value) => (
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
      <Button type="submit">Save credential</Button>
    </form>
  );
}

export function AiKeyManager() {
  const { aiKeys, deleteAiKey, getApiKeyForProvider } = useAiKeys();
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string) {
    try {
      await deleteAiKey(id);
      toast.success("AI key removed.");
    } catch {
      toast.error("Unable to delete key.");
    }
  }

  async function handleTest(provider: string) {
    const apiKey = await getApiKeyForProvider(provider);
    if (!apiKey) {
      toast.error("No credential stored for this provider.");
      return;
    }

    const response = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });

    if (!response.ok) {
      toast.error("Connection test failed.");
      return;
    }

    toast.success("Connection successful.");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">AI Keys</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Provider credentials</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Store provider-issued credentials locally in your browser for OpenAI, Codex, Anthropic, Gemini, Groq, or GitHub Models-backed workflows.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Add provider key</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add AI provider</DialogTitle>
            <DialogDescription>Credentials stay in your local browser database.</DialogDescription>
          </DialogHeader>
          <KeyEditor onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2">
        {aiKeys.map((key) => (
          <Card key={key.id}>
            <CardHeader>
              <CardTitle>{AI_PROVIDER_DETAILS[key.provider as keyof typeof AI_PROVIDER_DETAILS]?.label ?? key.provider}</CardTitle>
              <CardDescription>Added {new Date(key.createdAt).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleTest(key.provider)}>Test connection</Button>
              <Button variant="ghost" onClick={() => handleDelete(key.id)}>Delete</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
