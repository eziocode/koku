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
  chart-legend.tsx      → shared legend (supports icons + live dots)
  status-badge.tsx      → StatusBadge / AssignmentBadge (shared status pills)
  segment-tooltip.tsx   → rich per-day tooltip listing every work log
  segmented-bar-chart.tsx → stacked, per-work-log daily bars (primary chart)
  project-pie-chart.tsx → distribution donut (projects or status)
  trend-line-chart.tsx  → momentum area chart
  daily-bar-chart.tsx   → DEPRECATED shim → SegmentedBarChart
```

## Core concept: segmented daily activity

Instead of a single aggregated bar per day, a day is rendered as a **stack of
segments** — one segment per work log. Segment height is proportional to that
log's duration. Every log for a day is represented (not just the first), each in
a distinct colour, and hovering the column surfaces details for **all** of them.

### Runs, pauses, and parallel tasks

A log is drawn as its worked **runs** (`WorkLogSegment.runs`), not as one bar
stretched from its start across its duration. A log that was paused while a
parallel task ran occupies only the stretches it was actually running — drawing
both from their own starts put them on top of each other and hid the second.
`buildSegmentedDays` fills `runs` from the entry's recorded `segments` (written by
`buildEntryFromTimer` on every pause), clipped to the day; entries with none get a
single run.

`buildDayBlocks` (`lib/charts/day-blocks.ts`) packs lanes **per log, not per
run**: a log holds one lane from its first run to its last, so the parallel task
started during its pause lands on a lane of its own instead of threading through
the gap and reading as one continuous stripe. Logs that genuinely overlap —
manual entries, imported rows — stack the same way.

The pause between two runs of one log is emitted as a `pause` block and drawn as
a thin connector in the log's own colour, so the log reads as one thing spanning
its lane without claiming the pause as worked time. A hatched "no log found" gap
is only drawn where *neither* a run nor a pause covers the time.

Every surface that prints an entry's timing uses `formatRunRanges`
(`lib/charts/run-format.ts`), so a paused log reads `11:00 → 11:30, 12:20 → 13:30`
rather than an outer span that contradicts the worked-only duration beside it.

### Status & assignment

Each segment carries a derived **status** and **assignment** so the graph and the
reports pie stay visually consistent:

| Field | Values | How it's derived |
| --- | --- | --- |
| `status` | `completed` · `running` · `pending` · `failed` | `running` when the log has no `endAt`; `pending` when it has an end but zero duration; `completed` otherwise. `failed` is only set via an explicit `status` override. |
| `assignment` | `assigned` · `unassigned` | `assigned` when the log has a `projectId`. |

Colours for these come from `STATUS_COLORS` in `theme.ts` (via `getStatusColor`)
and are shared by `<StatusBadge>`, `<AssignmentBadge>`, the chart, and the pie
legend.

**Running logs** render with a pulsing outline in the bar, a spinning icon and pulsing dot in the `<StatusBadge>`, and a live dot in the
legend. All live animations respect `prefers-reduced-motion`.

**Unassigned logs** get a dashed outline in the bar and the neutral colour, so
they're recognisable without reading the tooltip.

```ts
import { buildSegmentedDays } from "@/lib/charts/segments";

const days = buildSegmentedDays({
  entries,                       // TimeEntry[]
  projectMap,                    // Map<id, { id, name, color }>
  categoryMap,                   // optional Map<id, { id, name }>
  interval: { start, end },      // optional — emits empty days for a continuous axis
  labelFormat: "weekday",        // "weekday" (Mon) | "date" (Jun 3)
  holidayDates,                  // notifications.holidayDates — `yyyy-MM-dd`[]
  weekendDays,                   // notifications.silentDays — 0 = Sun … 6 = Sat
});
```

### Non-working days

A day matching `holidayDates` (or, failing that, a weekday in `weekendDays`)
carries a `nonWorking` marker — `{ kind: "holiday" | "weekend", label }`. An
explicit holiday wins over the recurring week-off day, being the more specific
statement about that date.

When such a day has **no** logs, `<SegmentedBarChart>` draws a single rule across
the whole track with the label centred on it (colours from `NON_WORKING_COLORS`)
instead of an empty track, and its total reads `—`: a day off and a day with
nothing logged should not look identical. Work logged *on* a holiday still counts
in full — the day is merely flagged with a coloured dot beside its date.

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
