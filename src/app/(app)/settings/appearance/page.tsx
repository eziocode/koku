import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings / Appearance"
        title="Appearance"
        description="Customise how Koku looks and feels on this device. Preferences are saved locally."
      />
      <AppearanceSettings />
    </div>
  );
}
