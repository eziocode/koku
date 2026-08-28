import { EndOfDaySettings } from "@/components/settings/notifications/end-of-day-settings";

export default function EndOfDaySettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">End of day</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Auto-stop running timers at your logoff time, with a grace period to answer first.
        </p>
      </div>
      <EndOfDaySettings />
    </div>
  );
}
