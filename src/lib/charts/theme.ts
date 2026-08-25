/**
 * Centralised chart theme.
 *
 * All chart colours flow through this module so palettes stay consistent
 * across the dashboard and reports, and adapt to the light/dark CSS variables
 * defined in `globals.css`. Avoid hardcoding hex values inside chart
 * components — use these helpers instead.
 */

/**
 * Categorical palette used to colour work-log segments when an entry has no
 * project colour of its own. Hues are chosen to remain distinguishable in both
 * light and dark themes and to sit harmoniously beside the brand primary.
 */
export const SEGMENT_PALETTE = [
  "#a43a30", // brand primary (terracotta)
  "#c75a4d", // accent
  "#2f6f6a", // teal
  "#3b6ea5", // steel blue
  "#b8862f", // ochre
  "#6d5b97", // muted violet
  "#4f8a5b", // sage
  "#c26a8d", // dusty rose
  "#5c7a99", // slate
  "#8a6d3b", // bronze
] as const;

/** Neutral colour used for entries with no project association. */
export const UNASSIGNED_COLOR = "#8b8178";

/**
 * Deterministically maps an arbitrary key (project id, tag, index) to a stable
 * palette colour, so the same project keeps the same colour across renders and
 * across charts.
 */
export function getSegmentColor(key: string | number): string {
  if (typeof key === "number") {
    return SEGMENT_PALETTE[Math.abs(key) % SEGMENT_PALETTE.length];
  }

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return SEGMENT_PALETTE[Math.abs(hash) % SEGMENT_PALETTE.length];
}

function mixHexChannel(base: number, accent: number, accentWeight: number) {
  return Math.round(base * (1 - accentWeight) + accent * accentWeight);
}

function parseHexColor(color: string) {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }

  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0");
}

export function getSegmentVariantColor(baseColor: string, key: string | number): string {
  const accent = getSegmentColor(key);
  const baseRgb = parseHexColor(baseColor);
  const accentRgb = parseHexColor(accent);

  if (!baseRgb || !accentRgb) {
    return `color-mix(in srgb, ${baseColor} 72%, ${accent})`;
  }

  return `#${toHex(mixHexChannel(baseRgb.r, accentRgb.r, 0.28))}${toHex(
    mixHexChannel(baseRgb.g, accentRgb.g, 0.28),
  )}${toHex(mixHexChannel(baseRgb.b, accentRgb.b, 0.28))}`;
}

/**
 * Resolves the colour for a work-log segment: prefer the project's own colour,
 * fall back to a deterministic palette colour keyed by project id, and finally
 * to the neutral "unassigned" colour.
 */
export function resolveEntryColor(input: {
  projectColor?: string | null;
  projectId?: string | null;
}): string {
  if (input.projectColor) {
    return input.projectColor;
  }
  if (input.projectId) {
    return getSegmentColor(input.projectId);
  }
  return UNASSIGNED_COLOR;
}

/**
 * Status + assignment palette. These colours are intentionally semantic (not
 * from the categorical palette) and stay consistent across the graph, tooltips,
 * legends, and the reports pie chart. Chosen for adequate contrast in both
 * light and dark themes and to read as accessible status colours.
 */
export const STATUS_COLORS = {
  completed: "#2f8f5b", // green — done
  running: "#3b6ea5", // blue — live/active
  pending: "#b8862f", // amber — awaiting work
  failed: "#d92d20", // red — failed
  assigned: "#5a4fb0", // violet — tied to a project
  unassigned: "#8b8178", // neutral — no project
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

/**
 * Resolves a semantic colour for a status or assignment key, falling back to
 * the neutral colour for anything unknown. Used by charts and legends so a
 * single key → colour mapping is shared everywhere.
 */
export function getStatusColor(key: string): string {
  return (STATUS_COLORS as Record<string, string>)[key] ?? UNASSIGNED_COLOR;
}

/**
 * Shared styling tokens for chart chrome (axes, grid, cursor). Colours use the
 * theme CSS variables so charts respond to light/dark mode automatically.
 */
export const CHART_TOKENS = {
  grid: "color-mix(in srgb, var(--color-muted-foreground) 18%, transparent)",
  /** Unlabelled hourly gridlines — deliberately fainter than `grid`. */
  gridSubtle: "color-mix(in srgb, var(--color-muted-foreground) 8%, transparent)",
  axis: "var(--color-muted-foreground)",
  cursor: "color-mix(in srgb, var(--color-primary) 8%, transparent)",
  radius: 6,
  animationDuration: 420,
} as const;

/**
 * Fixed day-scale axis for daily-activity charts: a full 24-hour domain so a
 * quiet day and a heavy day are directly comparable across ranges, instead of
 * recharts rescaling the axis to whatever the tallest column happens to be.
 *
 * Gridlines land on every hour; only every third hour is labelled, because 25
 * tick labels do not fit a typical plot area.
 */
export const DAY_AXIS = {
  /** Clamped upward only — overlapping entries can push a day past 24h. */
  domain: [0, (dataMax: number) => Math.max(24, Math.ceil(dataMax))] as [
    number,
    (dataMax: number) => number,
  ],
  labelledTicks: [0, 3, 6, 9, 12, 15, 18, 21, 24] as number[],
  gridlineHours: Array.from({ length: 25 }, (_, hour) => hour),
} as const;
