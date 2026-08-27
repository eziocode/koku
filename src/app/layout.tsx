import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { AppProviders } from "@/components/providers/app-providers";
import { ServiceWorkerRegistrar } from "@/components/providers/service-worker-registrar";
import { buildAccentScript } from "@/lib/appearance";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: {
    default: "刻 Koku",
    template: "%s · 刻 Koku",
  },
  description: "Mark the moment. Master your time.",
  applicationName: "刻 Koku",
  keywords: ["time tracking", "knowledge graph", "notes", "AI", "productivity"],
  authors: [{ name: "Koku" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Koku",
  },
  // Icons are auto-detected from the `src/app/icon.png` and
  // `src/app/apple-icon.png` file conventions — no manual entries needed.
  openGraph: {
    title: "刻 Koku",
    description: "Mark the moment. Master your time.",
    siteName: "刻 Koku",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "刻 Koku",
    description: "Mark the moment. Master your time.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#a43a30" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  // The shell is a fixed, app-like layout (`overflow-hidden` body, `100dvh`
  // panels, installable PWA) rather than a scrolling document — it was never
  // laid out to survive an arbitrary pinch zoom. Zooming out shrinks the
  // visual viewport below the layout viewport the shell is sized to, which
  // exposes unstyled canvas past its fixed panels ("random pixels" on pinch).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        {/* Applies the persisted accent before first paint to avoid the
            terracotta flash-of-default-accent on hard refresh / tab switch.
            Runs synchronously from a localStorage cache; Dexie remains the
            source of truth and reconciles post-hydration. */}
        <Script id="accent-script" strategy="beforeInteractive">
          {buildAccentScript()}
        </Script>
      </head>
      <body className="h-full overflow-hidden bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
