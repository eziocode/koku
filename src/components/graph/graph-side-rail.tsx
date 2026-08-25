"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Collapsible overlay rail for the graph controls.
 *
 * The canvas fills the whole frame and the layout spreads nodes to its edges,
 * so controls that float on top will sometimes cover a node. Collapsing the
 * rail to a single button gives the graph back an unobstructed frame, the way
 * Obsidian's graph lets you hide its settings panel.
 */
export function GraphSideRail({
  children,
  width = 230,
  className,
}: {
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={cn("pointer-events-none absolute inset-y-4 left-4 flex flex-col gap-2", className)}
      style={{ width: open ? width : undefined }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Hide graph controls" : "Show graph controls"}
        title={open ? "Hide controls" : "Show controls"}
        className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
      >
        {open ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeftOpen className="h-4 w-4" />
        )}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pb-16">{children}</div>
      ) : null}
    </div>
  );
}
