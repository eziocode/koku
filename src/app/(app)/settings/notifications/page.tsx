import { NotificationSettings } from "@/components/settings/notification-settings";

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Check-in reminders, breaks, and do-not-disturb. All off by default, and each option can be
          switched off on its own.
        </p>
      </div>
      <NotificationSettings />
    </div>
  );
}
