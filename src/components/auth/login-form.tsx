"use client";

import { Loader2, LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

interface LoginFormProps {
  localMode?: boolean;
}

export function LoginForm({ localMode = false }: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => searchParams.get("callbackUrl") || "/dashboard", [searchParams]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Local mode: email + password form ──────────────────────────────────────
  async function handleLocalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const fd = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/local-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });

    setIsSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Invalid credentials.");
      return;
    }

    toast.success("Welcome back to Koku.");
    window.location.href = callbackUrl;
  }

  if (localMode) {
    return (
      <Card className="border-primary/10 bg-card/90 shadow-2xl shadow-primary/10 backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
            刻
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your local Koku workspace.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleLocalSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="name@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
              Sign in
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            New to Koku?{" "}
            <a href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Cloud / Catalyst mode ─────────────────────────────────────────────────
  return (
    <Card className="border-primary/10 bg-card/90 shadow-2xl shadow-primary/10 backdrop-blur">
      <CardHeader className="space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
          刻
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to continue shaping your time, notes, and insight graph.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={() => {
            setIsSubmitting(true);
            window.location.href = `/__catalyst/auth/login?redirectURL=${encodeURIComponent(callbackUrl)}`;
          }}
        >
          {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
          Sign in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New to Koku?{" "}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => { window.location.href = "/__catalyst/auth/signup"; }}
          >
            Create an account
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
