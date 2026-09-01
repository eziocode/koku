"use client";

import { Menu, MoonStar, Settings, SunMedium, UserCircle2 } from "lucide-react";
import Link from "next/link";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { setTheme, resolvedTheme } = useTheme();
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar}>
        <Menu />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {userEmail ? "Cloud-connected workspace" : "Local-first workspace"}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {userEmail ? "Synced across devices, private, and calm by default." : "Private, portable, and calm by default."}
        </p>
      </div>
      {/* Renders nothing unless do-not-disturb is on. */}
      <DndPill />
      {userEmail ? (
        <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:block">
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
    </header>
  );
}
