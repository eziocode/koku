"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

interface AiKeyRecord {
  id: string;
  provider: string;
  createdAt: string;
}

function KeyEditor({ onSaved }: { onSaved: () => void }) {
  const router = useRouter();
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/ai-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });

    if (!response.ok) {
      toast.error("Unable to save AI key.");
      return;
    }

    toast.success("AI key saved.");
    router.refresh();
    onSaved();
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

export function AiKeyManager({ keys }: { keys: AiKeyRecord[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string) {
    const response = await fetch(`/api/ai-keys/${id}`, { method: "DELETE" });

    if (!response.ok) {
      toast.error("Unable to delete key.");
      return;
    }

    toast.success("AI key removed.");
    router.refresh();
  }

  async function handleTest(provider: string) {
    const response = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });

    if (!response.ok) {
      toast.error("Connection test failed.");
      return;
    }

    toast.success("Connection successful.");
  }

  return (
    <div className="space-y-5">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Add provider key</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add AI provider</DialogTitle>
            <DialogDescription>Credentials are encrypted before being stored.</DialogDescription>
          </DialogHeader>
          <KeyEditor onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2">
        {keys.map((key) => (
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
