import { NotificationTestCard } from "@/components/settings/notifications/notification-test-card";
import { SettingsSearch } from "@/components/settings/settings-search";
import { SettingsSectionGrid } from "@/components/settings/settings-section-grid";
import { sectionsForHub } from "@/lib/settings/registry";

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

      <SettingsSearch scope="notifications">
        <SettingsSectionGrid sections={sectionsForHub("notifications")} />
      </SettingsSearch>

      <NotificationTestCard />
    </div>
  );
}
