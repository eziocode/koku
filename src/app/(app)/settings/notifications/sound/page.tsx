import { SoundSettings } from "@/components/settings/notifications/sound-settings";

export default function SoundSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sound</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The chime reminders play when they fire, and its volume.
        </p>
      </div>
      <SoundSettings />
    </div>
  );
}
