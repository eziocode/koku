"use client";

import type { CanvasNodeKind } from "@/components/graph/graph-canvas";
import { cn } from "@/lib/utils";

/**
 * Legend-sized outline of each node family, in a 24×24 box centred on (12, 12).
 *
 * These are hand-simplified rather than shared with the canvas glyphs. The
 * canvas artwork is authored for a body tens of pixels across and drawn under a
 * scale transform; at 12px every one of its inner details collapses into a
 * blot. What a key has to carry is the silhouette, so that is all these draw:
 * the *primary* member of each family, stripped to its outline.
 */
const KIND_GLYPH: Record<CanvasNodeKind, React.ReactNode> = {
  hub: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M5 9.5h14M4.6 14.5h14.8" />
    </>
  ),
  group: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-20 12 12)" />
      <ellipse cx="12" cy="12" rx="7.2" ry="2.6" transform="rotate(35 12 12)" />
    </>
  ),
  tag: <path d="M12 3c0 4.9.1 5 4.5 5.6C12.1 9.2 12 9.3 12 14.2c0-4.9-.1-5-4.5-5.6C11.9 8 12 7.9 12 3Z" />,
  leaf: (
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="10" cy="10.4" r="1.6" />
      <circle cx="13.8" cy="14" r="1.1" />
    </>
  ),
};

/** Stroke-only glyph for one node family, tinted by `color`. */
export function KindGlyph({
  kind,
  color,
  className,
}: {
  kind: CanvasNodeKind;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {KIND_GLYPH[kind]}
    </svg>
  );
}

interface KindKeyItem {
  kind: CanvasNodeKind;
  label: string;
}

/**
 * Key for the node families.
 *
 * Separate from `GraphLegend` on purpose: that legend maps colour to grouping,
 * this maps shape to kind, and folding both into one list would suggest the two
 * encode the same thing.
 */
export function GraphKindKey({
  items,
  className,
}: {
  items: KindKeyItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none rounded-2xl border border-border/60 bg-card/90 p-3 shadow-sm backdrop-blur",
        className,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Shapes
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {items.map((item) => (
          <li key={item.kind} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KindGlyph kind={item.kind} className="text-foreground/70" />
            <span className="truncate">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
