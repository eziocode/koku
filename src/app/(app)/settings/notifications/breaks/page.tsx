import { BreakSettings } from "@/components/settings/notifications/break-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function BreakSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Notifications / Breaks"
        title="Breaks"
        description="The break button, its preset lengths, and what happens when a break ends."
      />
      <BreakSettings />
    </div>
  );
}
