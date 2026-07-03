# Chart components

Reusable, theme-aware chart building blocks for the koku dashboard and reports.
All charts are client components built on [Recharts](https://recharts.org) and
consume colours from the centralised chart theme in `src/lib/charts/theme.ts`.

## Architecture

```
src/lib/charts/
  theme.ts        → palette, colour resolution, shared chart tokens
  segments.ts     → transforms TimeEntry[] → segmented daily activity
src/components/charts/
  chart-card.tsx        → consistent card chrome (header + footer/legend)
  chart-states.tsx      → ChartLoading / ChartEmpty / ChartError
  chart-legend.tsx      → shared legend
  segment-tooltip.tsx   → rich per-work-log tooltip
  segmented-bar-chart.tsx → stacked, per-work-log daily bars (primary chart)
  project-pie-chart.tsx → project distribution donut
  trend-line-chart.tsx  → momentum area chart
  daily-bar-chart.tsx   → DEPRECATED shim → SegmentedBarChart
```

## Core concept: segmented daily activity

Instead of a single aggregated bar per day, a day is rendered as a **stack of
segments** — one segment per work log. Segment height is proportional to that
log's duration.

```ts
import { buildSegmentedDays } from "@/lib/charts/segments";

const days = buildSegmentedDays({
  entries,                       // TimeEntry[]
  projectMap,                    // Map<id, { id, name, color }>
  categoryMap,                   // optional Map<id, { id, name }>
  interval: { start, end },      // optional — emits empty days for a continuous axis
  labelFormat: "weekday",        // "weekday" (Mon) | "date" (Jun 3)
});
```

## `<SegmentedBarChart>`

The primary chart. Renders stacked, coloured segments with a rich hover tooltip
(title, description, project, start/end, duration, tags) and optional click
handler.

```tsx
<SegmentedBarChart
  days={days}
  height={288}
  onSegmentClick={(segment) => router.push(`/log?date=${day}`)}
  emptyTitle="No sessions this week"
  emptyDescription="Start a timer to see your week."
/>
```

| Prop | Type | Description |
| --- | --- | --- |
| `days` | `SegmentedDay[]` | Output of `buildSegmentedDays`. |
| `height` | `number` | Chart height in px. Default `288`. |
| `onSegmentClick` | `(s: WorkLogSegment) => void` | Click handler; enables pointer cursor. |
| `emptyTitle` / `emptyDescription` | `string` | Empty-state copy. |

## `<ChartCard>`

Standard chrome so every chart shares spacing, typography, and an optional
legend footer.

```tsx
<ChartCard title="This week" description="…" footer={<ChartLegend items={items} />}>
  <SegmentedBarChart days={days} />
</ChartCard>
```

## States

`<ChartLoading />`, `<ChartEmpty />`, `<ChartError />` — all accept a `height`
prop and share the chart footprint so layout does not jump. Charts render
`ChartEmpty` internally when there is no data. Use `ChartLoading` as the
`dynamic()` loading fallback.

## Theming

Colours resolve in this order: project's own colour → deterministic palette
colour keyed by project id → neutral "unassigned". Never hardcode hex values in
a chart; import from `theme.ts`:

```ts
import { resolveEntryColor, getSegmentColor, CHART_TOKENS } from "@/lib/charts/theme";
```

Axis, grid, and cursor colours use CSS variables (`--color-*`) so charts adapt
to light/dark mode automatically.

## Accessibility & performance

- `<SegmentedBarChart>` renders a visually-hidden (`sr-only`) `<table>` mirroring
  every work log (day, title, project, duration) so screen-reader users get the
  same data the visual chart conveys. (The SVG segments themselves are not
  keyboard-focusable — Recharts does not expose per-cell focus targets — so the
  table is the accessible equivalent, not a supplement.)
- State components expose `role="status"` / `role="alert"` and `aria-label`s.
- Data transforms are pure and memoised at the call site (`useMemo`).
- Reports lazy-load charts via `next/dynamic` with a `ChartLoading` fallback.
- Recharts `ResponsiveContainer` keeps charts fluid across breakpoints.
