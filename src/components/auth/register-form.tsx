"use client";

import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RegisterForm() {
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
          onClick={() => {
            window.location.href = `/__catalyst/auth/signup?redirectURL=${encodeURIComponent("/dashboard")}`;
          }}
        >
          <UserPlus />
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => {
              window.location.href = "/__catalyst/auth/login";
            }}
          >
            Sign in
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
