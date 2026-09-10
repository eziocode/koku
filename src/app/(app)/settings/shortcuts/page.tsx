import { ShortcutsSettings } from "@/components/settings/shortcuts-settings";
import { PageHeader } from "@/components/layout/page-header";

export default function ShortcutsSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings / Shortcuts"
        title="Keyboard shortcuts"
        description={
          <>
            Bare keys and Shift-key combos only, so nothing here collides with your browser or OS. Press{" "}
            <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">?</kbd> anywhere in
            the app for this same list.
          </>
        }
      />
      <ShortcutsSettings />
    </div>
  );
}
