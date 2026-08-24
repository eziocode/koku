"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";
import { CatalystSignIn } from "@/components/auth/catalyst-sign-in";

interface CloudUser {
  id: string;
  email?: string;
  displayName?: string;
}

const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

export default function AccountSettingsPage() {
  const { value: savedDisplayName, setValue: setDisplayName } = useTypedSetting("displayName");
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
    await setDisplayName(displayName.trim());
    setDraftDisplayName(null);
    toast.success("Local profile updated.");
  }

  async function handleLogout() {
    try {
      // Fetch the logout route first so the server can probe and clear the
      // Catalyst session before we navigate. If the server-side probe succeeds
      // it returns a 3xx that fetch follows automatically to the final page;
      // we read the resolved URL and navigate there. If anything goes wrong
      // (network error, Catalyst unavailable, INVALID_URL_PATTERN, etc.) we
      // fall back to sending the browser straight to the home (Profiles) page
      // so login details are visually cleared regardless.
      const response = await fetch("/api/auth/logout", {
        redirect: "follow",
        cache: "no-store",
      });
      // On success the server ultimately resolves to the home page URL.
      const destination = response.url || "/";
      window.location.assign(destination);
    } catch {
      // Network or unexpected error — navigate to home (Profiles) page directly.
      window.location.assign("/");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Account &amp; Profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account &amp; profile</h1>
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
                  <p className="mt-1 text-xs text-muted-foreground">User ID: {cloudUser.id}</p>
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  Sign out
                </Button>
              </div>
            ) : (
              <CatalystSignIn onSignedIn={() => {
                fetch("/api/auth/me", { cache: "no-store" })
                  .then((response) => response.json())
                  .then(({ user }: { user: CloudUser | null }) => setCloudUser(user))
                  .catch(() => setCloudUser(null));
              }} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
