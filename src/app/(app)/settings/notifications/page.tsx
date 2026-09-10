import { NotificationTestCard } from "@/components/settings/notifications/notification-test-card";
import { SettingsSearch } from "@/components/settings/settings-search";
import { SettingsSectionGrid } from "@/components/settings/settings-section-grid";
import { sectionsForHub } from "@/lib/settings/registry";
import { PageHeader } from "@/components/layout/page-header";

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings / Notifications"
        title="Notifications"
        description="Check-in reminders start on by default at 30 minutes; every option below can be switched off on its own."
      />

      <SettingsSearch scope="notifications">
        <SettingsSectionGrid sections={sectionsForHub("notifications")} />
      </SettingsSearch>

      <NotificationTestCard />
    </div>
  );
}
