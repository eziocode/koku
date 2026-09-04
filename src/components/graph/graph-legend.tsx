"use client";

import type { CanvasNodeKind } from "@/components/graph/graph-canvas";
import { KindGlyph } from "@/components/graph/graph-kind-key";
import { cn } from "@/lib/utils";

export interface GraphLegendItem {
  key: string;
  label: string;
  color: string;
  /** Right-aligned secondary value — note count, hours, … */
  meta?: string;
  /** Group whose nodes are individually coloured; drawn as a rainbow swatch. */
  mixed?: boolean;
  /**
   * Every node in this group shares one body. Set it and the swatch becomes
   * that body's outline instead of a dot, so the legend names the shape you are
   * looking at on the canvas rather than only its colour.
   */
  glyph?: CanvasNodeKind;
}

interface GraphLegendProps {
  title: string;
  items: GraphLegendItem[];
  /** Legends get long fast; the rest collapse into a "+N more" line. */
  maxItems?: number;
  className?: string;
}

export function GraphLegend({ title, items, maxItems = 8, className }: GraphLegendProps) {
  if (items.length === 0) {
    return null;
  }

  const visible = items.slice(0, maxItems);
  const hidden = items.length - visible.length;

  return (
    <div
      className={cn(
        "pointer-events-none rounded-2xl border border-border/60 bg-card/90 p-3 shadow-sm backdrop-blur",
        className,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {visible.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-xs">
            {item.glyph && !item.mixed ? (
              <KindGlyph kind={item.glyph} color={item.color} />
            ) : (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={
                  item.mixed
                    ? {
                        backgroundImage:
                          "conic-gradient(#e0603f, #c9993a, #4bab6a, #2fa8a0, #3f8fd0, #8a6ede, #e0699e, #e0603f)",
                      }
                    : { backgroundColor: item.color }
                }
              />
            )}
            <span className="truncate text-foreground">
              {item.label}
              {item.mixed ? <span className="text-muted-foreground"> · mixed</span> : null}
            </span>
            {item.meta ? (
              <span className="ml-auto shrink-0 text-muted-foreground">{item.meta}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">+{hidden} more</p>
      ) : null}
    </div>
  );
}
