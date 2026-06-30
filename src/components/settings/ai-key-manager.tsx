"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useAiKeys } from "@/lib/storage/hooks/use-ai-keys";

function KeyEditor({ onSaved }: { onSaved: () => void }) {
  const { saveAiKey } = useAiKeys();
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");

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
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="google">Google Gemini</SelectItem>
            <SelectItem value="groq">Groq</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="api-key">API key</Label>
        <Input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required />
      </div>
      <Button type="submit">Save key</Button>
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
      toast.error("No API key stored for this provider.");
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
          Store API keys locally in your browser for OpenAI, Anthropic, Gemini, or Groq-backed workflows.
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
              <CardTitle className="capitalize">{key.provider}</CardTitle>
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
