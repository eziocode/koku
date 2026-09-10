import { QuickActionsSettings } from "@/components/settings/quick-actions-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function QuickActionsSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings / Quick actions"
        title="Quick actions"
        description="Custom one-click buttons for calls, standups, and anything else you want tracked live."
      />
      <QuickActionsSettings />
    </div>
  );
}
