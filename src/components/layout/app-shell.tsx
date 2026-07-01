"use client";

import { ReactNode, useState } from "react";

import { CommandPalette } from "@/components/layout/command-palette";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <CommandPalette />
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-0">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className={cn("mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8")}>
          {children}
        </main>
      </div>
    </div>
  );
}
