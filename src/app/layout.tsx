import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

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
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
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
      <body className="min-h-screen bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
