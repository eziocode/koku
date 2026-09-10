import { ScheduleSettings } from "@/components/settings/notifications/schedule-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function ScheduleSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Notifications / Schedule"
        title="Quiet hours & schedule"
        description="Do not disturb, a daily quiet window, silent weekdays, and one-off holidays."
      />
      <ScheduleSettings />
    </div>
  );
}
