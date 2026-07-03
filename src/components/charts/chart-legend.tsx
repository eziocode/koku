"use client";

interface LegendItem {
  key: string;
  label: string;
  color: string;
  value?: string;
}

interface ChartLegendProps {
  items: LegendItem[];
  className?: string;
}

/** Compact, accessible legend shared across charts. */
export function ChartLegend({ items, className }: ChartLegendProps) {
  if (!items.length) return null;
  return (
    <ul className={["flex flex-wrap gap-x-4 gap-y-2", className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 rounded-full ring-1 ring-border"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{item.label}</span>
          {item.value ? (
            <span className="font-medium tabular-nums text-foreground">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
