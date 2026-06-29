"use client";

import { LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  function handleSignIn() {
    window.location.href = `/__catalyst/auth/login?redirectURL=${encodeURIComponent(callbackUrl)}`;
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
        <Button className="w-full" onClick={handleSignIn}>
          <LogIn />
          Sign in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New to Koku?{" "}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => {
              window.location.href = "/__catalyst/auth/signup";
            }}
          >
            Create an account
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
