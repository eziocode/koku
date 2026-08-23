"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useSettings } from "@/lib/storage/hooks/use-settings";
import { CatalystSignIn } from "@/components/auth/catalyst-sign-in";

interface CloudUser {
  id: string;
  email?: string;
  displayName?: string;
}

const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

export default function AccountSettingsPage() {
  const { getSetting, setSetting } = useSettings();
  const rawDisplayName = getSetting("displayName");
  const savedDisplayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
  const [draftDisplayName, setDraftDisplayName] = useState<string | null>(null);
  const displayName = draftDisplayName ?? savedDisplayName;

  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(!isLocalMode);

  useEffect(() => {
    if (isLocalMode) return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(({ user }: { user: CloudUser | null }) => setCloudUser(user))
      .catch(() => setCloudUser(null))
      .finally(() => setLoadingUser(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await setSetting("displayName", displayName.trim());
    setDraftDisplayName(null);
    toast.success("Local profile updated.");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCloudUser(null);
    toast.success("Signed out of Zoho.");
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

      {!isLocalMode && (
        <Card>
          <CardHeader>
            <CardTitle>Zoho account</CardTitle>
            <CardDescription>
              Sign in with your Zoho account to sync data across devices via Catalyst.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingUser ? (
              <p className="text-sm text-muted-foreground">Checking sign-in status…</p>
            ) : cloudUser ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-sm font-medium">{cloudUser.displayName ?? "Zoho User"}</p>
                  {cloudUser.email && (
                    <p className="text-xs text-muted-foreground">{cloudUser.email}</p>
                  )}
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  Sign out
                </Button>
              </div>
            ) : (
              <CatalystSignIn />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
