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
  paused: "#6b7b8c", // slate — in flight but not counting
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
  axis: "var(--color-muted-foreground)",
  cursor: "color-mix(in srgb, var(--color-primary) 8%, transparent)",
  radius: 6,
  animationDuration: 420,
} as const;

/**
 * Non-working day markers. A holiday and a weekly off day are not "no data" —
 * they are days nobody was expected to log, so they get their own colours
 * instead of borrowing a status colour that means something else.
 */
export const NON_WORKING_COLORS = {
  holiday: "#3b6ea5", // steel blue — a declared holiday
  weekend: "#e0bc79", // sand — a recurring week-off day
} as const;

export type NonWorkingColorKey = keyof typeof NON_WORKING_COLORS;
