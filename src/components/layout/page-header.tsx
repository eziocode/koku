import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Section label above the title. Matches the sidebar entry for the route. */
  eyebrow: string;
  /** Optional marker beside the eyebrow, e.g. a beta badge. */
  badge?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Primary controls for the page, right-aligned on desktop. */
  actions?: ReactNode;
  /** Secondary controls (tabs, scope switches) placed under the description. */
  children?: ReactNode;
  className?: string;
}

/**
 * The one title/action row every route uses.
 *
 * Each page used to hand-roll this block, and they had drifted: three eyebrow
 * sizes, two letter-spacings, and different heading margins, so switching
 * routes moved the title. Sharing the markup keeps the row in one place across
 * the app and gives every page the same stacking behaviour on a phone.
 */
export function PageHeader({ eyebrow, badge, title, description, actions, children, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary-accessible">{eyebrow}</p>
            {badge}
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
