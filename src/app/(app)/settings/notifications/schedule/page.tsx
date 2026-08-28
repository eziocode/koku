import { ScheduleSettings } from "@/components/settings/notifications/schedule-settings";

export default function ScheduleSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Quiet hours &amp; schedule</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Do not disturb, a daily quiet window, silent weekdays, and one-off holidays.
        </p>
      </div>
      <ScheduleSettings />
    </div>
  );
}
