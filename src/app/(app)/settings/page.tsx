import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const settingsSections = [
  {
    title: "Account",
    description: "Profile preferences, identity, and session settings.",
    href: "/settings/account",
  },
  {
    title: "Projects",
    description: "Manage project colors, rates, and active tracking contexts.",
    href: "/settings/projects",
  },
  {
    title: "AI Keys",
    description: "Add encrypted provider credentials for AI workflows.",
    href: "/settings/ai-keys",
  },
  {
    title: "Storage",
    description: "Choose backup providers, schedules, and export destinations.",
    href: "/settings/storage",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Shape your Koku workspace</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Tune the foundation behind your time intelligence system.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {settingsSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-primary">Open section →</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
