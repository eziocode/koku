import { SettingsBackLink } from "@/components/settings/settings-back-link";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <SettingsBackLink />
      {children}
    </div>
  );
}
