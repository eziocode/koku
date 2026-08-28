import { ShortcutsSettings } from "@/components/settings/shortcuts-settings";

export default function ShortcutsSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Keyboard shortcuts</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Bare keys and Shift-key combos only, so nothing here collides with your browser or OS.
          Press <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">?</kbd> anywhere
          in the app for this same list.
        </p>
      </div>
      <ShortcutsSettings />
    </div>
  );
}
