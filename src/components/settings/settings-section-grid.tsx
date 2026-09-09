import Link from "next/link";

import { BetaBadge } from "@/components/ui/beta-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SettingsSectionMeta } from "@/lib/settings/registry";

/**
 * The card grid both settings hubs render. Kept in one place so a new settings
 * page is a registry entry and nothing else.
 */
export function SettingsSectionGrid({ sections }: { sections: SettingsSectionMeta[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => (
        <Link key={section.href} href={section.href}>
          <Card className="h-full transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {section.title}
                {section.beta ? <BetaBadge /> : null}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-primary">Open section →</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
