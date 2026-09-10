import { EndOfDaySettings } from "@/components/settings/notifications/end-of-day-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function EndOfDaySettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Notifications / End of day"
        title="End of day"
        description="Auto-stop running timers at your logoff time, with a grace period to answer first."
      />
      <EndOfDaySettings />
    </div>
  );
}
