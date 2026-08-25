/**
 * Flash-free accent handling.
 *
 * The accent preference is the source-of-truth in IndexedDB (Dexie), read
 * asynchronously by `AppearanceProvider` *after* React hydrates. That async gap
 * is what causes the ~0.5s flash of the default terracotta accent on hard
 * refresh / tab switch — the DOM paints with the default tokens, then
 * `data-accent` is applied a beat later.
 *
 * IndexedDB cannot be read synchronously before paint, so we mirror the accent
 * into `localStorage` (which *is* synchronously readable) and apply the
 * `data-accent` attribute via a blocking inline `<script>` in `<head>` — the
 * same technique `next-themes` uses to avoid the light/dark flash.
 *
 * IndexedDB remains the source of truth; `localStorage` is only a warm cache
 * that keeps the pre-paint script fast and flash-free.
 */

export const ACCENT_KEYS = [
  "terracotta",
  "ocean",
  "forest",
  "lavender",
  "amber",
  "slate",
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

/** `terracotta` is the default `@theme` value, so it carries no attribute. */
export const DEFAULT_ACCENT: AccentKey = "terracotta";

/** Browser storage name for pre-paint accent cache. */
export const ACCENT_STORAGE_NAME = "koku-accent";

export function isValidAccent(value: unknown): value is AccentKey {
  return typeof value === "string" && (ACCENT_KEYS as readonly string[]).includes(value);
}

/**
 * Applies the accent to `<html>` exactly the way the pre-paint script does, so
 * the runtime provider and the blocking script never drift apart. Terracotta
 * (the default) clears the attribute rather than setting it.
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

/** Writes the warm cache read by the pre-paint script. Safe to call on the client only. */
export function cacheAccent(accent: AccentKey): void {
  try {
    localStorage.setItem(ACCENT_STORAGE_NAME, accent);
  } catch {
    /* private mode / storage disabled — the async provider still corrects it */
  }
}

/**
 * The dependency-free blocking script injected into `<head>`. It reads the
 * cached accent from localStorage and applies `data-accent` before first paint.
 * Written as a plain string so layout can inline it before hydration.
 * and executed before hydration. Fails silently so a corrupt/absent cache can
 * never block render — the async provider will reconcile post-hydration.
 */
export function buildAccentScript(): string {
  const keys = JSON.stringify(ACCENT_KEYS);
  const storageName = JSON.stringify(ACCENT_STORAGE_NAME);
  const fallback = JSON.stringify(DEFAULT_ACCENT);

  return `(function(){try{var v=localStorage.getItem(${storageName});var k=${keys};var d=${fallback};if(!v||k.indexOf(v)===-1){v=d;}var h=document.documentElement;if(v===d){h.removeAttribute("data-accent");}else{h.setAttribute("data-accent",v);}}catch(e){}})();`;
}
