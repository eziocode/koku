"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => searchParams.get("callbackUrl") || "/dashboard", [searchParams]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setError("We couldn’t sign you in with those credentials.");
      return;
    }

    toast.success("Welcome back to Koku.");
    router.push(callbackUrl);
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    await signIn("google", { callbackUrl });
  }

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
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="name@company.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
            Sign in
          </Button>
        </form>

        <div className="relative py-2 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <span className="bg-card px-3">or</span>
          <span className="absolute inset-x-0 top-1/2 -z-10 h-px -translate-y-1/2 bg-border" />
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isSubmitting}>
          Continue with Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New to Koku? {" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
