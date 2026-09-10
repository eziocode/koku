import { MiniPlayerSettings } from "@/components/settings/mini-player-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function MiniPlayerSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings / Mini player"
        title="Mini player"
        description="A floating window that keeps your timer visible above every tab."
      />
      <MiniPlayerSettings />
    </div>
  );
}
