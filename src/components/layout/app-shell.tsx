"use client";

import { ReactNode, useState } from "react";

import { CommandPalette } from "@/components/layout/command-palette";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function AppShell({ children, user }: AppShellProps) {
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
        <Topbar user={user} onOpenSidebar={() => setSidebarOpen(true)} />
        <main className={cn("flex-1 px-4 py-6 sm:px-6 lg:px-8")}>{children}</main>
      </div>
    </div>
  );
}
