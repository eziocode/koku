import Link from "next/link";
import { ArrowRight, Bot, ChartColumnBig, Clock3, Download, Network, NotebookPen } from "lucide-react";

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
    description: "Generate standups, monthly narratives, and focused chat answers grounded in your work.",
  },
  {
    icon: ChartColumnBig,
    title: "Reporting with signal",
    description: "Break down effort by day, project, and trend with elegant analytics and exports.",
  },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(192,57,43,0.14),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(231,76,60,0.12),_transparent_28%)]" />
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <Logo href="/" />
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 pb-20 pt-14 sm:px-6 lg:px-8">
        <section className="grid items-center gap-14 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-8">
            <Badge className="rounded-full px-4 py-1 text-sm">Mark the moment. Master your time.</Badge>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                <span className="text-primary">刻</span> Koku makes your workday legible.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                A refined operating system for focused teams and individual makers—track time, connect notes, surface insights, and narrate progress with AI.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group">
                <Link href="/register">
                  Build your workspace
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Clarity", "Unify time, notes, and reports."],
                ["Flow", "Fast keyboard-first navigation."],
                ["Memory", "Build a living graph of your work."],
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
            <p className="text-sm uppercase tracking-[0.3em] text-primary">Self-host</p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Run Koku on your own machine.
            </h2>
            <p className="text-muted-foreground">
              Download the setup script for your OS. It installs all dependencies, starts a local database, and has Koku running in minutes — no account required.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "macOS",
                description: "Double-click .command file",
                file: "setup-mac.command",
                badge: "Intel & Apple Silicon",
              },
              {
                label: "Linux",
                description: "Run with bash",
                file: "setup-linux.sh",
                badge: "Ubuntu, Fedora, Arch…",
              },
              {
                label: "Windows",
                description: "Double-click .bat file",
                file: "setup-windows.bat",
                badge: "Windows 10 / 11",
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
                    <a href={`/downloads/${item.file}`} download>
                      Download for {item.label}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Requires{" "}
            <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">Node.js 20+</a>
            {" "}and{" "}
            <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noreferrer" className="text-primary hover:underline">Docker</a>.
            {" "}Also available:{" "}
            <a href="/downloads/docker-compose.yml" download className="text-primary hover:underline">docker-compose.yml</a>
            {" "}for the database only.
          </p>
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
