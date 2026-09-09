import { Suspense } from "react";

import { SettingsBackLink } from "@/components/settings/settings-back-link";
import { SettingsHighlightReader } from "@/components/settings/settings-highlight-reader";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <SettingsBackLink />
      {/* Renders nothing; the boundary is what `useSearchParams` requires. */}
      <Suspense fallback={null}>
        <SettingsHighlightReader />
      </Suspense>
      {children}
    </div>
  );
}
