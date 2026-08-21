import { MiniPlayerSettings } from "@/components/settings/mini-player-settings";

export default function MiniPlayerSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mini player</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A floating window that keeps your timer visible above every tab.
        </p>
      </div>
      <MiniPlayerSettings />
    </div>
  );
}
