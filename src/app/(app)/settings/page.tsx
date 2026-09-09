import { SettingsSearch } from "@/components/settings/settings-search";
import { SettingsSectionGrid } from "@/components/settings/settings-section-grid";
import { sectionsForHub } from "@/lib/settings/registry";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Shape your local workspace</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Tune the device-first foundation behind your time intelligence system.
        </p>
      </div>
      {/* The grid is passed as children so it stays a server component: an empty
          query renders it untouched, with no extra client JS. */}
      <SettingsSearch scope="all">
        <SettingsSectionGrid sections={sectionsForHub("root")} />
      </SettingsSearch>
    </div>
  );
}
