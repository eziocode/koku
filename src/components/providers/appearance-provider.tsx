"use client";

import { ReactNode, useEffect } from "react";

import { useSettings } from "@/lib/storage/hooks/use-settings";

export const ACCENT_KEYS = ["terracotta", "ocean", "forest", "lavender", "amber", "slate"] as const;
export type AccentKey = (typeof ACCENT_KEYS)[number];

function isValidAccent(value: unknown): value is AccentKey {
  return typeof value === "string" && (ACCENT_KEYS as readonly string[]).includes(value);
}

/**
 * Reads the persisted accent preference from Dexie and applies a `data-accent`
 * attribute to `<html>` so that the CSS variable overrides in globals.css take effect.
 * "terracotta" is the default @theme value, so no attribute is needed for it.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { getSetting } = useSettings();
  const rawAccent = getSetting("accent");
  const accent: AccentKey = isValidAccent(rawAccent) ? rawAccent : "terracotta";

  useEffect(() => {
    const html = document.documentElement;
    if (accent === "terracotta") {
      html.removeAttribute("data-accent");
    } else {
      html.setAttribute("data-accent", accent);
    }
  }, [accent]);

  return <>{children}</>;
}
