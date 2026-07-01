"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useSettings } from "@/lib/storage/hooks/use-settings";

export default function AccountSettingsPage() {
  const { getSetting, setSetting } = useSettings();
  const rawDisplayName = getSetting("displayName");
  const savedDisplayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
  const [draftDisplayName, setDraftDisplayName] = useState<string | null>(null);
  const displayName = draftDisplayName ?? savedDisplayName;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await setSetting("displayName", displayName.trim());
    setDraftDisplayName(null);
    toast.success("Local profile updated.");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Local Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Profile on this device</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Customize how Koku refers to you locally. Nothing is synced unless you export it.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>Stored only in your browser’s local database.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => setDraftDisplayName(event.target.value)}
                placeholder="Koku User"
              />
            </div>
            <Button type="submit">Save local name</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
