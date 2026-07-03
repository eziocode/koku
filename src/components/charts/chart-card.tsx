"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  /** Optional slot rendered on the right of the header (legend, actions). */
  headerAside?: ReactNode;
  /** Optional footer slot (e.g. legend). */
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Consistent card chrome for every chart: standardised header typography,
 * spacing, and an optional footer for legends. Keeps the reports and dashboard
 * visually aligned.
 */
export function ChartCard({
  title,
  description,
  headerAside,
  footer,
  className,
  contentClassName,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn("minimal-panel overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {headerAside ? <div className="shrink-0">{headerAside}</div> : null}
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>
        {children}
        {footer ? <div className="border-t border-border/60 pt-4">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
