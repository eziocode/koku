import localFont from "next/font/local";

/**
 * Every typeface the font-style picker can select, bundled locally rather than
 * pulled from a font CDN: the app is local-first and must render identically
 * offline, and self-hosted files keep the first paint free of a third-party
 * request.
 *
 * Each family is one variable face covering the whole weight range the UI uses,
 * so a style costs a single download. Only the default (Manrope) is preloaded —
 * the rest carry `preload: false`, so the browser fetches a family the first
 * time a `[data-font]` rule in `globals.css` actually references its variable.
 * Someone who never leaves the default pays nothing for the other eight.
 *
 * Every option below is spelled out longhand on purpose: `next/font` resolves
 * these calls at build time and rejects computed values, so a shared helper
 * that assembled `src` arrays would fail to compile.
 */

/** The default heading face. Preloaded, since it paints on every first load. */
export const headingFont = localFont({
  src: [
    { path: "./fonts/manrope-latin.woff2", style: "normal", weight: "400 800" },
    { path: "./fonts/manrope-latin-ext.woff2", style: "normal", weight: "400 800" },
  ],
  display: "swap",
  variable: "--font-manrope",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const interFont = localFont({
  src: [
    { path: "./fonts/inter-latin.woff2", style: "normal", weight: "400 700" },
    { path: "./fonts/inter-latin-ext.woff2", style: "normal", weight: "400 700" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-inter",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const geistFont = localFont({
  src: [
    { path: "./fonts/geist-latin.woff2", style: "normal", weight: "400 700" },
    { path: "./fonts/geist-latin-ext.woff2", style: "normal", weight: "400 700" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-geist",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const geistMonoFont = localFont({
  src: [
    { path: "./fonts/geist-mono-latin.woff2", style: "normal", weight: "400 600" },
    { path: "./fonts/geist-mono-latin-ext.woff2", style: "normal", weight: "400 600" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-geist-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const jakartaFont = localFont({
  src: [
    { path: "./fonts/jakarta-latin.woff2", style: "normal", weight: "400 700" },
    { path: "./fonts/jakarta-latin-ext.woff2", style: "normal", weight: "400 700" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-jakarta",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const dmSansFont = localFont({
  src: [
    { path: "./fonts/dmsans-latin.woff2", style: "normal", weight: "400 700" },
    { path: "./fonts/dmsans-latin-ext.woff2", style: "normal", weight: "400 700" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-dmsans",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const groteskFont = localFont({
  src: [
    { path: "./fonts/grotesk-latin.woff2", style: "normal", weight: "400 700" },
    { path: "./fonts/grotesk-latin-ext.woff2", style: "normal", weight: "400 700" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-grotesk",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const plexSansFont = localFont({
  src: [
    { path: "./fonts/plex-sans-latin.woff2", style: "normal", weight: "400 600" },
    { path: "./fonts/plex-sans-latin-ext.woff2", style: "normal", weight: "400 600" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-plex-sans",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const plexMonoFont = localFont({
  src: [
    { path: "./fonts/plex-mono-latin.woff2", style: "normal", weight: "400 600" },
    { path: "./fonts/plex-mono-latin-ext.woff2", style: "normal", weight: "400 600" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-plex-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const sourceSerifFont = localFont({
  src: [
    { path: "./fonts/source-serif-latin.woff2", style: "normal", weight: "400 700" },
    { path: "./fonts/source-serif-latin-ext.woff2", style: "normal", weight: "400 700" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-source-serif",
  fallback: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
});

/**
 * Class names that publish every family's CSS variable. Applied once on
 * `<html>` so the `[data-font]` blocks can point the font tokens at any of
 * them; declaring a variable does not download anything on its own.
 */
export const fontVariableClasses = [
  headingFont.variable,
  interFont.variable,
  geistFont.variable,
  geistMonoFont.variable,
  jakartaFont.variable,
  dmSansFont.variable,
  groteskFont.variable,
  plexSansFont.variable,
  plexMonoFont.variable,
  sourceSerifFont.variable,
].join(" ");
