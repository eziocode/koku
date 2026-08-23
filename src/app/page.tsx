import Link from "next/link";
import { ArrowRight, Bot, ChartColumnBig, Clock3, Download, Network, NotebookPen } from "lucide-react";

import { CatalystSignIn } from "@/components/auth/catalyst-sign-in";
import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Clock3,
    title: "Time tracking that feels calm",
    description: "Run timers, log sessions, and review your day without losing focus.",
  },
  {
    icon: NotebookPen,
    title: "Notes that connect themselves",
    description: "Capture context in linked documents and surface patterns through wiki-style references.",
  },
  {
    icon: Network,
    title: "Knowledge graph clarity",
    description: "See ideas, projects, and themes connect visually as your workspace matures.",
  },
  {
    icon: Bot,
    title: "AI reports with your voice",
    description: "Use your own keys to generate standups, monthly narratives, and chat grounded in your data.",
  },
  {
    icon: ChartColumnBig,
    title: "Reporting with signal",
    description: "Break down effort by day, project, and trend with elegant analytics and exports.",
  }, 
];

const isLocalMode = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

export default function Home() {
  return (
    <div className="relative overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(192,57,43,0.14),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(231,76,60,0.12),_transparent_28%)]" />
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <Logo href="/" />
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/settings/storage">Export / Import</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 pb-20 pt-14 sm:px-6 lg:px-8">
        <section className="grid items-center gap-14 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-8">
            <Badge className="rounded-full px-4 py-1 text-sm">Local-first. No account. Ready instantly.</Badge>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                <span className="text-primary">刻</span> Koku makes your workday legible.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                A refined operating system for focused teams and individual makers—track time, connect notes,
                surface insights, and narrate progress with AI, all from your own browser storage.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group">
                <Link href="/dashboard">
                  Start locally
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/settings/storage">Backup tools</Link>
              </Button>
              {!isLocalMode && <CatalystSignIn className="h-11 px-8 text-base" />}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Private", "Data stays on this device by default."],
                ["Fast", "Live local queries keep every view current."],
                ["Portable", "Export everything as one JSON file anytime."],
              ].map(([title, description]) => (
                <Card key={title} className="border-primary/10 bg-card/80 backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden border-primary/15 bg-card/85 shadow-2xl shadow-primary/10 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-xl">Today at a glance</CardTitle>
              <CardDescription>Beautiful telemetry for deep work and connected thinking.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Focused hours", "06:45:18"],
                  ["Active projects", "4"],
                  ["Linked notes", "28"],
                  ["Momentum", "+18%"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-border bg-background/70 p-4">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-5">
                <p className="text-sm font-medium text-primary">AI summary</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  “You spent the morning in product design, then transitioned into bug triage. Notes around onboarding formed a new cluster worth revisiting tomorrow.”
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm uppercase tracking-[0.3em] text-primary">Local-first</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Works out of the box in your browser.
            </h2>
            <p className="text-muted-foreground">
              No sign-up, no database bootstrap, no background services. Add projects, notes, time logs, and AI keys locally — then export or import a full JSON snapshot whenever you need it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Export JSON",
                description: "Take a complete snapshot of every table.",
                badge: "One click",
              },
              {
                label: "Import JSON",
                description: "Restore or merge into a fresh browser profile.",
                badge: "Local only",
              },
              {
                label: "Cloud sync",
                description: "Google Drive connection placeholder for future sync.",
                badge: "Coming soon",
              },
            ].map((item) => (
              <Card key={item.label} className="border-border/70 bg-card/80 backdrop-blur">
                <CardHeader className="pb-3">
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Download className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{item.label}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{item.badge}</p>
                  <Button asChild size="sm" className="w-full">
                    <Link href="/settings/storage">Open storage settings</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm uppercase tracking-[0.3em] text-primary">Capabilities</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Built for intentional work, not busywork.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="h-full border-border/70 bg-card/80 backdrop-blur transition-transform hover:-translate-y-1">
                  <CardHeader>
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
