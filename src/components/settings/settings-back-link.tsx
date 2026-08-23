"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Back affordance for settings sub-pages. Rendered by the settings layout so
 * every sub-section gets it without repeating markup; hidden on the settings
 * index itself, where there is nothing to go back to inside settings.
 */
export function SettingsBackLink() {
  const pathname = usePathname();
  const segments = (pathname ?? "/settings").split("/").filter(Boolean);

  if (segments.length <= 1) {
    return null;
  }

  const parentHref = `/${segments.slice(0, -1).join("/")}`;
  const parentLabel = segments.length === 2
    ? "Settings"
    : segments[segments.length - 2].replace(/-/g, " ");

  return (
    <Link
      href={parentHref}
      aria-label={`Back to ${parentLabel}`}
      className="group -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      <span className="capitalize">{parentLabel}</span>
    </Link>
  );
}
