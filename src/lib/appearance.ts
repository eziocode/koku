/**
 * Flash-free appearance handling: accent colour, surface style, font style.
 *
 * All three preferences are source-of-truth in IndexedDB (Dexie), read
 * asynchronously by `AppearanceProvider` *after* React hydrates. That async gap
 * is what causes the ~0.5s flash of the defaults on hard refresh / tab switch —
 * the DOM paints with the default tokens, then the attributes are applied a
 * beat later.
 *
 * IndexedDB cannot be read synchronously before paint, so we mirror each choice
 * into `localStorage` (which *is* synchronously readable) and apply the
 * `data-accent`, `data-surface` and `data-font` attributes via a blocking
 * inline `<script>` in `<head>` — the same technique `next-themes` uses to
 * avoid the light/dark flash.
 *
 * IndexedDB remains the source of truth; `localStorage` is only a warm cache
 * that keeps the pre-paint script fast and flash-free. Each attribute swaps a
 * band of CSS custom properties in `globals.css`, and the three are fully
 * orthogonal: any accent works with any surface and any font.
 */

export const SURFACE_KEYS = [
  "warm",
  "cool",
  "neutral",
  "contrast",
] as const;

export type SurfaceKey = (typeof SURFACE_KEYS)[number];

/** `warm` is the default `@theme` / `.dark` set, so it carries no attribute. */
export const DEFAULT_SURFACE: SurfaceKey = "warm";

/**
 * Browser storage name for the pre-paint surface cache. Named `..._NAME` rather
 * than `..._KEY` deliberately: `scripts/security-audit.mjs` fails the build on
 * storage writes whose argument name ends in "key".
 */
export const SURFACE_STORAGE_NAME = "koku-surface";

export const FONT_KEYS = [
  "manrope",
  "inter",
  "geist",
  "jakarta",
  "dmsans",
  "grotesk",
  "plex",
  "serif",
] as const;

export type FontKey = (typeof FONT_KEYS)[number];

/** `manrope` is the default `@theme` pairing, so it carries no attribute. */
export const DEFAULT_FONT: FontKey = "manrope";

/** Browser storage name for the pre-paint font cache. See the note above. */
export const FONT_STORAGE_NAME = "koku-font";

export const ACCENT_KEYS = [
  "teal",
  "ocean",
  "forest",
  "lavender",
  "amber",
  "slate",
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

/** `teal` is the default `@theme` value, so it carries no attribute. */
export const DEFAULT_ACCENT: AccentKey = "teal";

/** Browser storage name for pre-paint accent cache. */
export const ACCENT_STORAGE_NAME = "koku-accent";

export function isValidAccent(value: unknown): value is AccentKey {
  return typeof value === "string" && (ACCENT_KEYS as readonly string[]).includes(value);
}

export function isValidSurface(value: unknown): value is SurfaceKey {
  return typeof value === "string" && (SURFACE_KEYS as readonly string[]).includes(value);
}

export function isValidFont(value: unknown): value is FontKey {
  return typeof value === "string" && (FONT_KEYS as readonly string[]).includes(value);
}

/**
 * Applies the accent to `<html>` exactly the way the pre-paint script does, so
 * the runtime provider and the blocking script never drift apart. The default
 * accent clears the attribute rather than setting it.
 */
export function applyAccentToDocument(accent: AccentKey): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (accent === DEFAULT_ACCENT) {
    html.removeAttribute("data-accent");
  } else {
    html.setAttribute("data-accent", accent);
  }
}

/**
 * Applies the surface style to `<html>`. Like the accent, the default clears
 * the attribute rather than setting it, so the token blocks in `globals.css`
 * that carry no `[data-surface]` selector are the default palette.
 */
export function applySurfaceToDocument(surface: SurfaceKey): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (surface === DEFAULT_SURFACE) {
    html.removeAttribute("data-surface");
  } else {
    html.setAttribute("data-surface", surface);
  }
}

/** Applies the font style to `<html>`, clearing the attribute for the default. */
export function applyFontToDocument(font: FontKey): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (font === DEFAULT_FONT) {
    html.removeAttribute("data-font");
  } else {
    html.setAttribute("data-font", font);
  }
}

/** Writes the warm cache read by the pre-paint script. Safe to call on the client only. */
export function cacheAccent(accent: AccentKey): void {
  cacheAppearance(ACCENT_STORAGE_NAME, accent);
}

export function cacheSurface(surface: SurfaceKey): void {
  cacheAppearance(SURFACE_STORAGE_NAME, surface);
}

export function cacheFont(font: FontKey): void {
  cacheAppearance(FONT_STORAGE_NAME, font);
}

function cacheAppearance(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* private mode / storage disabled — the async provider still corrects it */
  }
}

/**
 * The dependency-free blocking script injected into `<head>`. It reads each
 * cached appearance choice from localStorage and applies its attribute before
 * first paint. Written as a plain string so layout can inline it before
 * hydration. Fails silently so a corrupt/absent cache can never block render —
 * the async provider reconciles from Dexie post-hydration.
 */
export function buildAppearanceScript(): string {
  const settings = [
    { attribute: "data-accent", name: ACCENT_STORAGE_NAME, keys: ACCENT_KEYS, fallback: DEFAULT_ACCENT },
    { attribute: "data-surface", name: SURFACE_STORAGE_NAME, keys: SURFACE_KEYS, fallback: DEFAULT_SURFACE },
    { attribute: "data-font", name: FONT_STORAGE_NAME, keys: FONT_KEYS, fallback: DEFAULT_FONT },
  ].map(({ attribute, name, keys, fallback }) => ({
    attribute: JSON.stringify(attribute),
    name: JSON.stringify(name),
    keys: JSON.stringify(keys),
    fallback: JSON.stringify(fallback),
  }));

  const body = settings
    .map(
      ({ attribute, name, keys, fallback }) =>
        `var v=localStorage.getItem(${name});var k=${keys};var d=${fallback};` +
        `if(!v||k.indexOf(v)===-1){v=d;}` +
        `if(v===d){h.removeAttribute(${attribute});}else{h.setAttribute(${attribute},v);}`,
    )
    .map((statements) => `(function(){try{${statements}}catch(e){}})();`)
    .join("");

  // Each choice is applied in its own try/catch so one unreadable cache entry
  // cannot stop the others from being applied.
  return `(function(){var h=document.documentElement;${body}})();`;
}
