"use client";

import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { KokuAiLauncher } from "@/components/ai/koku-ai-launcher";
import { ShortcutsProvider } from "@/components/layout/shortcuts-provider";
import { MiniPlayerProvider } from "@/components/mini-player/mini-player-provider";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { WelcomeSetup } from "@/components/onboarding/welcome-setup";
import { Sidebar } from "@/components/layout/sidebar";
import { OverlayResidueGuard } from "@/components/layout/overlay-residue-guard";
import { ViewportHeight } from "@/components/layout/viewport-height";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("koku-app-shell-active");
    return () => root.classList.remove("koku-app-shell-active");
  }, []);

  useLayoutEffect(() => {
    let frame = 0;

    const resetScroll = () => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
        mainRef.current.scrollLeft = 0;
      }
    };

    // The app scrolls inside a shared <main>, so route changes do not remount
    // the scroll container. Reset now and once more after Next's own scroll
    // handling, which can otherwise move the document by the topbar height.
    resetScroll();
    frame = requestAnimationFrame(resetScroll);

    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div className="app-viewport flex overflow-hidden bg-background text-foreground">
      <ViewportHeight />
      {/* Repairs a stale shell height and any body state a closing overlay left
          behind, so a dismissed dialog can never strand a dead strip. */}
      <OverlayResidueGuard />
      <ShortcutsProvider />
      {/* Receives notification actions (quick note / open log) from the service
          worker. Mounted here so it is route-independent, like the palette. */}
      <NotificationCenter />
      {/* Portals the floating mini player into its Picture-in-Picture window.
          Mounted here, not in AppProviders, so it never runs on the marketing root. */}
      <MiniPlayerProvider />
      {/* Floating Koku AI launcher and chat. Only renders once a connection
          has actually tested green, so an unconfigured/broken setup never
          puts a chat bubble in front of the user. */}
      <KokuAiLauncher />
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
        <main
          ref={mainRef}
          className={cn("min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6 lg:px-8")}
        >
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
