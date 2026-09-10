import { CheckInSettings } from "@/components/settings/notifications/check-in-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function CheckInSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Notifications / Check-ins"
        title="Check-in reminders"
        description="The master switch, how often check-ins fire, and which buttons appear on them."
      />
      <CheckInSettings />
    </div>
  );
}
