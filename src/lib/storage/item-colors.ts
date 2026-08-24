export const ITEM_COLOR_PALETTE = [
  "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0d9488", "#0891b2", "#4f46e5", "#9333ea", "#c026d3",
] as const;

type ColoredItem = { color?: string | null };

/** Normalize valid 3/6 digit hex values so equivalent spellings compare equal. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  return `#${hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex}`;
}

function fallbackColor(used: Set<string>): string {
  for (let index = 0; ; index += 1) {
    const hue = (index * 137.508 + 17) % 360;
    const saturation = 68;
    const lightness = 47;
    const chroma = (1 - Math.abs((2 * lightness) / 100 - 1)) * (saturation / 100);
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const match = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x]
      : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
    const m = lightness / 100 - chroma / 2;
    const rgb = match.map((channel) => Math.round((channel + m) * 255));
    const color = `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    if (!used.has(color)) return color;
  }
}

/** Return first unused curated color, then deterministic six-digit RGB fallback. */
export function getUnusedItemColor(
  projects: readonly ColoredItem[] = [],
  categories: readonly ColoredItem[] = [],
): string {
  const used = new Set(
    [...projects, ...categories]
      .map((item) => normalizeHexColor(item.color))
      .filter((color): color is string => color !== null),
  );
  return ITEM_COLOR_PALETTE.find((color) => !used.has(color)) ?? fallbackColor(used);
}
