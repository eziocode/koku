import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const settingsSections = [
  {
    title: "Appearance",
    description: "Choose your theme (light, dark, system) and accent colour.",
    href: "/settings/appearance",
  },
  {
    title: "Notifications",
    description: "Check-ins, quiet hours & schedule, breaks, and end of day, in four focused sections.",
    href: "/settings/notifications",
  },
  {
    title: "Quick actions",
    description: "Custom one-click buttons for calls, standups, and anything else you track live.",
    href: "/settings/quick-actions",
  },
  {
    title: "Mini player",
    description: "A floating always-on-top timer that stays visible across tabs.",
    href: "/settings/mini-player",
  },
  {
    title: "Account & Profile",
    description: "Personalize your display name and manage your Zoho account.",
    href: "/settings/account",
  },
  {
    title: "Projects",
    description: "Manage project colors, rates, and categories for local tracking.",
    href: "/settings/projects",
  },
  {
    title: "AI Keys",
    description: "Store provider credentials locally for AI workflows.",
    href: "/settings/ai-keys",
  },
  {
    title: "Storage",
    description: "Export, import, and prepare for optional cloud drive sync.",
    href: "/settings/storage",
  },
  {
    title: "Keyboard shortcuts",
    description: "Jump around and act on timers and breaks without leaving the keyboard.",
    href: "/settings/shortcuts",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Shape your local workspace</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Tune the device-first foundation behind your time intelligence system.
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
