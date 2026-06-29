import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="hidden space-y-6 lg:block">
        <p className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
          刻 Koku • Work Intelligence Platform
        </p>
        <div className="space-y-4">
          <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-foreground">
            Turn every session of work into lasting clarity.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Koku unifies time tracking, linked notes, analytics, and AI into one refined workspace designed for focused makers.
          </p>
        </div>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
          {[
            "Live timers and pomodoro rhythm",
            "Linked notes with knowledge graph",
            "Beautiful reporting and summaries",
          ].map((feature) => (
            <div key={feature} className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground shadow-sm">
              {feature}
            </div>
          ))}
        </div>
      </div>
      <LoginForm />
    </div>
  );
}
