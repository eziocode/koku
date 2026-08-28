import { CheckInSettings } from "@/components/settings/notifications/check-in-settings";

export default function CheckInSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Check-in reminders</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The master switch, how often check-ins fire, and which buttons appear on them.
        </p>
      </div>
      <CheckInSettings />
    </div>
  );
}
