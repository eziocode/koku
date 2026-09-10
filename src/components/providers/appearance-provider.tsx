"use client";

import { ReactNode, useEffect } from "react";
import { useTheme } from "next-themes";

import {
  ACCENT_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_FONT,
  DEFAULT_SURFACE,
  applyAccentToDocument,
  applyFontToDocument,
  applySurfaceToDocument,
  cacheAccent,
  cacheFont,
  cacheSurface,
  isValidAccent,
  isValidFont,
  isValidSurface,
  type AccentKey,
  type FontKey,
  type SurfaceKey,
} from "@/lib/appearance";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

export { ACCENT_KEYS };
export type { AccentKey };

/**
 * Reconciles the persisted appearance choices (source-of-truth in Dexie) with
 * the document: accent colour, surface style and font style.
 *
 * IndexedDB is asynchronous, so a pre-paint blocking script (see `layout.tsx`
 * + `buildAppearanceScript`) applies all three from a synchronous localStorage
 * cache *before* first paint to avoid a flash of the defaults. This provider
 * then keeps that cache in sync with the authoritative Dexie values, which is
 * also what makes a change in one tab follow into every other one.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const { value: rawAccent } = useTypedSetting("accent");
  const { value: rawSurface } = useTypedSetting("surface");
  const { value: rawFont } = useTypedSetting("fontStyle");
  const accent: AccentKey = isValidAccent(rawAccent) ? rawAccent : DEFAULT_ACCENT;
  const surface: SurfaceKey = isValidSurface(rawSurface) ? rawSurface : DEFAULT_SURFACE;
  const font: FontKey = isValidFont(rawFont) ? rawFont : DEFAULT_FONT;

  useEffect(() => {
    applyAccentToDocument(accent);
    // Keep the warm cache aligned so the next hard refresh paints correctly.
    cacheAccent(accent);
  }, [accent]);

  useEffect(() => {
    applySurfaceToDocument(surface);
    cacheSurface(surface);
  }, [surface]);

  // The page colour depends on both the surface style and light/dark, so the
  // browser-chrome colour is re-read whenever either of them changes.
  useEffect(() => {
    syncThemeColor();
  }, [surface, resolvedTheme]);

  useEffect(() => {
    applyFontToDocument(font);
    cacheFont(font);
  }, [font]);

  return <>{children}</>;
}

/**
 * Points the browser-chrome colour at the page background the chosen surface
 * actually paints. `layout.tsx` can only declare static values in `viewport`,
 * so without this an OLED-black or mist page would still report the default.
 */
function syncThemeColor() {
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background")
    .trim();
  if (!background) return;

  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tags.length) {
    const created = document.createElement("meta");
    created.name = "theme-color";
    created.content = background;
    document.head.appendChild(created);
    return;
  }
  // `viewport.themeColor` in `layout.tsx` ships a light/dark pair for the first
  // paint. Both are set to the resolved colour here: the media-scoped values
  // cannot know the surface style, and leaving one stale would let the chrome
  // disagree with the page after a style change.
  for (const tag of tags) tag.content = background;
}
