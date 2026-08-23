import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { InlineScript } from "@/components/inline-script";
import { AppProviders } from "@/components/providers/app-providers";
import { ServiceWorkerRegistrar } from "@/components/providers/service-worker-registrar";
import { buildAccentScript } from "@/lib/appearance";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the persisted accent before first paint to avoid the
            terracotta flash-of-default-accent on hard refresh / tab switch.
            Runs synchronously from a localStorage cache; Dexie remains the
            source of truth and reconciles post-hydration. */}
        <InlineScript html={buildAccentScript()} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
