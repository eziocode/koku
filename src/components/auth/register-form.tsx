"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

interface RegisterFormProps {
  localMode?: boolean;
}

export function RegisterForm({ localMode = false }: RegisterFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Local mode: full registration form ────────────────────────────────────
  async function handleLocalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const fd = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/local-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    });

    setIsSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Unable to create your account.");
      return;
    }

    toast.success("Your Koku workspace is ready.");
    router.push("/dashboard");
    router.refresh();
  }

  if (localMode) {
    return (
      <Card className="border-primary/10 bg-card/90 shadow-2xl shadow-primary/10 backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
            刻
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">Create your workspace</CardTitle>
            <CardDescription>Start tracking locally — fully private, no cloud required.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleLocalSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Your name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="name@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} placeholder="At least 8 characters" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Create account
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-primary hover:underline">
              Sign in
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
          <CardTitle className="text-2xl">Create your workspace</CardTitle>
          <CardDescription>
            Start tracking projects, knowledge, and momentum in one elegant place.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={() => {
            setIsSubmitting(true);
            window.location.href = `/__catalyst/auth/signup?redirectURL=${encodeURIComponent("/dashboard")}`;
          }}
        >
          {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => { window.location.href = "/__catalyst/auth/login"; }}
          >
            Sign in
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
