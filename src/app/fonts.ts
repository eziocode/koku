import localFont from "next/font/local";

/**
 * Manrope, bundled locally rather than pulled from a font CDN: the app is
 * local-first and must render identically offline, and a self-hosted file
 * keeps the first paint free of a third-party request.
 *
 * One variable face covers every heading weight the UI uses (500-800), so the
 * whole type system costs a single 24KB download.
 */
export const headingFont = localFont({
  src: [
    { path: "./fonts/manrope-latin.woff2", style: "normal", weight: "400 800" },
    { path: "./fonts/manrope-latin-ext.woff2", style: "normal", weight: "400 800" },
  ],
  display: "swap",
  variable: "--font-heading-family",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
