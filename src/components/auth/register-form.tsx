"use client";

import { Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export function RegisterForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
    };

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setIsSubmitting(false);
      setError(data?.error || "Unable to create your account.");
      return;
    }

    const signInResult = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!signInResult || signInResult.error) {
      toast.success("Account created. Please sign in.");
      router.push("/login");
      return;
    }

    toast.success("Your Koku workspace is ready.");
    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

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
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="Aswin K" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="name@company.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" minLength={8} placeholder="At least 8 characters" required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Create account
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
          Already have an account? {" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
