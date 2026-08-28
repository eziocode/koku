import { BreakSettings } from "@/components/settings/notifications/break-settings";

export default function BreakSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Breaks</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The break button, its preset lengths, and what happens when a break ends.
        </p>
      </div>
      <BreakSettings />
    </div>
  );
}
