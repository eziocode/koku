import { SoundSettings } from "@/components/settings/notifications/sound-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function SoundSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Notifications / Sound"
        title="Sound"
        description="The chime reminders play when they fire, and its volume."
      />
      <SoundSettings />
    </div>
  );
}
