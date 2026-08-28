import Link from "next/link";

import { NotificationTestCard } from "@/components/settings/notifications/notification-test-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const notificationSections = [
  {
    title: "Check-in reminders",
    description: "The master switch, cadence, and which buttons appear on the notification.",
    href: "/settings/notifications/check-ins",
  },
  {
    title: "Quiet hours & schedule",
    description: "Do not disturb, a daily quiet window, silent weekdays, and holidays.",
    href: "/settings/notifications/schedule",
  },
  {
    title: "Breaks",
    description: "The break button, preset lengths, and what happens when a break ends.",
    href: "/settings/notifications/breaks",
  },
  {
    title: "End of day",
    description: "Auto-stop running timers at your logoff time.",
    href: "/settings/notifications/end-of-day",
  },
];

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Check-in reminders start on by default at 30 minutes; every option below can be switched
          off on its own.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {notificationSections.map((section) => (
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

      <NotificationTestCard />
    </div>
  );
}
