"use client";

import { Menu, MoonStar, Settings, SunMedium, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { DndPill } from "@/components/notifications/dnd-pill";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ReminderBell } from "@/components/reminders/reminder-bell";
import { AppUpdateIndicator } from "@/components/layout/app-update-indicator";
import { ManualSync } from "@/components/layout/manual-sync";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShellSaveStatus, ShellTimer } from "@/components/layout/shell-status";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { appNavigation } from "@/lib/navigation";

/** Longest matching nav entry, so `/settings/storage` still reads "Settings". */
function routeTitle(pathname: string): string {
  const match = [...appNavigation]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.title;
  return pathname.startsWith("/admin") ? "Admin" : "Koku";
}

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((body: { user?: { email?: string } | null }) => {
        setUserEmail(body.user?.email ?? null);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-6">
      <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={onOpenSidebar}>
        <Menu />
      </Button>
      {/* The route name, not a tagline: the shell should say where you are, and
          the page's own header carries the longer description. */}
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{routeTitle(pathname)}</p>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        {/* Renders nothing unless a timer is running / do-not-disturb is on. */}
        <ShellTimer />
        <ShellSaveStatus />
        <DndPill />
        {userEmail ? (
          <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground xl:block">
            {userEmail}
          </span>
        ) : null}
        <ManualSync />
        <ReminderBell />
        <NotificationBell />
        <TooltipProvider>
          <AppUpdateIndicator />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {/* Both icons are rendered and one is hidden by the `dark` class
                    next-themes puts on <html>. Branching on `resolvedTheme` here
                    instead would render the light icon on the server and the dark
                    one after hydration — a mismatch, and a visible icon flip. */}
                <SunMedium className="hidden dark:block" />
                <MoonStar className="dark:hidden" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open settings menu">
              <UserCircle2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings/account">
                <UserCircle2 className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard">Dashboard</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
