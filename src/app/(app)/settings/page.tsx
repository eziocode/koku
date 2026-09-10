import { SettingsSearch } from "@/components/settings/settings-search";
import { SettingsSectionGrid } from "@/components/settings/settings-section-grid";
import { sectionsForHub } from "@/lib/settings/registry";
import { PageHeader } from "@/components/layout/page-header";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Shape your local workspace"
        description="Tune the device-first foundation behind your time intelligence system."
      />
      {/* The grid is passed as children so it stays a server component: an empty
          query renders it untouched, with no extra client JS. */}
      <SettingsSearch scope="all">
        <SettingsSectionGrid sections={sectionsForHub("root")} />
      </SettingsSearch>
    </div>
  );
}
