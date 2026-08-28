import { QuickActionsSettings } from "@/components/settings/quick-actions-settings";

export default function QuickActionsSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Quick actions</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Custom one-click buttons for calls, standups, and anything else you want tracked live.
        </p>
      </div>
      <QuickActionsSettings />
    </div>
  );
}
