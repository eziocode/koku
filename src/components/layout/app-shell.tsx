"use client";

import { ReactNode, useState } from "react";

import { CommandPalette } from "@/components/layout/command-palette";
import { MiniPlayerProvider } from "@/components/mini-player/mini-player-provider";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { WelcomeSetup } from "@/components/onboarding/welcome-setup";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <CommandPalette />
      {/* Receives notification actions (quick note / open log) from the service
          worker. Mounted here so it is route-independent, like the palette. */}
      <NotificationCenter />
      {/* Portals the floating mini player into its Picture-in-Picture window.
          Mounted here, not in AppProviders, so it never runs on the marketing root. */}
      <MiniPlayerProvider />
      {/* Mandatory first-run setup. It stays route-aware so settings remain
          usable when the user follows one of its direct setup links. */}
      <WelcomeSetup />
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="flex h-full min-w-0 flex-1 flex-col lg:pl-0">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8")}>
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
