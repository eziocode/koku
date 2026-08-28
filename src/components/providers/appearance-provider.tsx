"use client";

import { ReactNode, useEffect } from "react";

import {
  ACCENT_KEYS,
  DEFAULT_ACCENT,
  applyAccentToDocument,
  cacheAccent,
  isValidAccent,
  type AccentKey,
} from "@/lib/appearance";
import { useTypedSetting } from "@/lib/storage/hooks/use-typed-setting";

export { ACCENT_KEYS };
export type { AccentKey };

/**
 * Reconciles the persisted accent (source-of-truth in Dexie) with the document.
 *
 * IndexedDB is asynchronous, so a pre-paint blocking script (see `layout.tsx`
 * + `buildAccentScript`) applies the accent from a synchronous localStorage
 * cache *before* first paint to avoid the default-accent flash. This provider
 * then keeps that cache in sync with the authoritative Dexie value.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { value: rawAccent } = useTypedSetting("accent");
  const accent: AccentKey = isValidAccent(rawAccent) ? rawAccent : DEFAULT_ACCENT;

  useEffect(() => {
    applyAccentToDocument(accent);
    // Keep the warm cache aligned so the next hard refresh paints correctly.
    cacheAccent(accent);
  }, [accent]);

  return <>{children}</>;
}
